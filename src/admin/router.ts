import { timingSafeEqual } from 'node:crypto';
import Router from '@koa/router';
import type { Context, Next } from 'koa';
import type { AppConfig, User, Role, Team } from '../config/schema.js';
import { MemoryAdapter } from '../store/memory.js';
import { createUserHandlers, type AdminState } from './handlers/users.js';
import { createRoleHandlers } from './handlers/roles.js';
import { createTeamHandlers } from './handlers/teams.js';
import { PatchLoginConfigBody, ImportBody, formatZodError } from './validation.js';

function deepCloneUsers(users: User[]): User[] {
  return users.map((u) => ({
    ...u,
    teams: [...u.teams],
  }));
}

function deepCloneRoles(roles: Role[]): Role[] {
  return roles.map((r) => ({
    ...r,
    scopes: [...r.scopes],
  }));
}

function deepCloneTeams(teams: Team[]): Team[] {
  return teams.map((t) => ({
    ...t,
    scopes: [...t.scopes],
  }));
}

function deepCloneLoginConfig(config: AppConfig['login']): AppConfig['login'] {
  return { ...config };
}

function deepCloneClients(clients: AppConfig['clients']): AppConfig['clients'] {
  return clients.map((c) => ({
    ...c,
    redirectUris: [...c.redirectUris],
    grantTypes: [...c.grantTypes],
    scopes: [...c.scopes],
  }));
}

export interface AdminRouterOptions {
  config: AppConfig;
  users: User[];
}

export function createAdminRouter({ config, users }: AdminRouterOptions): Router {
  // Build state object that shares references with the server
  const baselineRoles = deepCloneRoles(config.roles);
  const baselineTeams = deepCloneTeams(config.teams);
  const state: AdminState = {
    users,
    config,
    baselineUsers: deepCloneUsers(users),
    baselineConfig: { ...config, login: deepCloneLoginConfig(config.login), clients: deepCloneClients(config.clients) },
  };

  const userHandlers = createUserHandlers(state);
  const roleHandlers = createRoleHandlers(state);
  const teamHandlers = createTeamHandlers(state);
  const router = new Router({ prefix: '/admin/v1' });

  // JSON body parser middleware for admin routes
  router.use(async (ctx: Context, next: Next) => {
    if (ctx.method === 'POST' || ctx.method === 'PATCH' || ctx.method === 'PUT') {
      const maxBodySize = 1_048_576; // 1MB
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of ctx.req) {
        size += (chunk as Buffer).length;
        if (size > maxBodySize) {
          ctx.status = 413;
          ctx.body = { error: 'Request body too large' };
          return;
        }
        chunks.push(chunk as Buffer);
      }
      const raw = Buffer.concat(chunks).toString();
      if (raw.length > 0) {
        try {
          (ctx.request as any).body = JSON.parse(raw);
        } catch {
          ctx.status = 400;
          ctx.body = { error: 'Invalid JSON body' };
          return;
        }
      } else {
        (ctx.request as any).body = {};
      }
    }
    await next();
  });

  // Optional API key auth middleware
  router.use(async (ctx: Context, next: Next) => {
    if (config.admin.apiKey) {
      const authHeader = ctx.get('authorization');
      const expected = `Bearer ${config.admin.apiKey}`;
      const a = Buffer.from(authHeader);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        ctx.status = 401;
        ctx.body = { error: 'Unauthorized: invalid or missing API key' };
        return;
      }
    }
    await next();
  });

  // User CRUD
  router.get('/users', (ctx) => userHandlers.list(ctx));
  router.get('/users/:id', (ctx) => userHandlers.get(ctx));
  router.post('/users', (ctx) => userHandlers.create(ctx));
  router.patch('/users/:id', (ctx) => userHandlers.update(ctx));
  router.delete('/users/:id', (ctx) => userHandlers.delete(ctx));

  // Role CRUD
  router.get('/roles', (ctx) => roleHandlers.list(ctx));
  router.get('/roles/:id', (ctx) => roleHandlers.get(ctx));
  router.post('/roles', (ctx) => roleHandlers.create(ctx));
  router.patch('/roles/:id', (ctx) => roleHandlers.update(ctx));
  router.delete('/roles/:id', (ctx) => roleHandlers.delete(ctx));

  // Team CRUD
  router.get('/teams', (ctx) => teamHandlers.list(ctx));
  router.get('/teams/:id', (ctx) => teamHandlers.get(ctx));
  router.get('/teams/:id/members', (ctx) => teamHandlers.members(ctx));
  router.post('/teams', (ctx) => teamHandlers.create(ctx));
  router.patch('/teams/:id', (ctx) => teamHandlers.update(ctx));
  router.delete('/teams/:id', (ctx) => teamHandlers.delete(ctx));

  // Import — replace state with provided data
  router.post('/import', (ctx) => {
    const parsed = ImportBody.safeParse((ctx.request as any).body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: formatZodError(parsed.error) };
      return;
    }
    const input = parsed.data;

    if (input.roles) {
      state.config.roles.length = 0;
      for (const r of input.roles) state.config.roles.push({ ...r, scopes: [...r.scopes] });
    }
    if (input.teams) {
      state.config.teams.length = 0;
      for (const t of input.teams) state.config.teams.push({ ...t, scopes: [...t.scopes] });
    }
    if (input.users) {
      state.users.length = 0;
      for (const u of input.users) state.users.push({ ...u, teams: [...u.teams] });
    }
    if (input.clients) {
      state.config.clients.length = 0;
      for (const c of input.clients) state.config.clients.push({
        clientId: c.clientId,
        clientSecret: c.clientSecret,
        redirectUris: [...c.redirectUris],
        grantTypes: [...c.grantTypes],
        scopes: [...c.scopes],
        tokenEndpointAuthMethod: c.tokenEndpointAuthMethod,
      });
    }

    // Flush OIDC state since identity model changed
    MemoryAdapter.flushAll();

    ctx.body = {
      status: 'imported',
      roles: state.config.roles.length,
      teams: state.config.teams.length,
      users: state.users.length,
      clients: state.config.clients.length,
    };
  });

  // Reset all state
  router.post('/reset', (ctx) => {
    // Restore users to baseline
    state.users.length = 0;
    for (const u of deepCloneUsers(state.baselineUsers)) {
      state.users.push(u);
    }

    // Restore roles to baseline
    state.config.roles.length = 0;
    for (const r of deepCloneRoles(baselineRoles)) {
      state.config.roles.push(r);
    }

    // Restore teams to baseline
    state.config.teams.length = 0;
    for (const t of deepCloneTeams(baselineTeams)) {
      state.config.teams.push(t);
    }

    // Restore clients to baseline
    state.config.clients.length = 0;
    for (const c of deepCloneClients(state.baselineConfig.clients)) {
      state.config.clients.push(c);
    }

    // Restore login config to baseline
    state.config.login.mode = state.baselineConfig.login.mode;
    state.config.login.autoLoginUser = state.baselineConfig.login.autoLoginUser;

    // Flush OIDC state (tokens, sessions, codes)
    MemoryAdapter.flushAll();

    ctx.body = { status: 'reset', users: state.users.length, roles: state.config.roles.length, teams: state.config.teams.length };
  });

  // Reset only users
  router.post('/reset/users', (ctx) => {
    state.users.length = 0;
    for (const u of deepCloneUsers(state.baselineUsers)) {
      state.users.push(u);
    }
    ctx.body = { status: 'reset', users: state.users.length };
  });

  // Reset only roles
  router.post('/reset/roles', (ctx) => {
    state.config.roles.length = 0;
    for (const r of deepCloneRoles(baselineRoles)) {
      state.config.roles.push(r);
    }
    ctx.body = { status: 'reset', roles: state.config.roles.length };
  });

  // Reset only teams
  router.post('/reset/teams', (ctx) => {
    state.config.teams.length = 0;
    for (const t of deepCloneTeams(baselineTeams)) {
      state.config.teams.push(t);
    }
    ctx.body = { status: 'reset', teams: state.config.teams.length };
  });

  // Patch login config
  router.patch('/config/login', (ctx) => {
    const parsed = PatchLoginConfigBody.safeParse((ctx.request as any).body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: formatZodError(parsed.error) };
      return;
    }
    const input = parsed.data;

    // If autoLoginUser is set, validate user exists
    if (input.autoLoginUser !== undefined) {
      const user = state.users.find((u) => u.id === input.autoLoginUser);
      if (!user) {
        ctx.status = 400;
        ctx.body = { error: `User '${input.autoLoginUser}' not found` };
        return;
      }
    }

    if (input.mode !== undefined) {
      state.config.login.mode = input.mode;
    }
    if (input.autoLoginUser !== undefined) {
      state.config.login.autoLoginUser = input.autoLoginUser;
    }

    ctx.body = {
      mode: state.config.login.mode,
      autoLoginUser: state.config.login.autoLoginUser,
    };
  });

  return router;
}
