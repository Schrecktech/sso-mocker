import Router from '@koa/router';
import type { Context, Next } from 'koa';
import type { AppConfig, User } from '../config/schema.js';
import { MemoryAdapter } from '../store/memory.js';
import { createUserHandlers, type AdminState } from './handlers/users.js';
import { PatchLoginConfigBody } from './validation.js';
import { ZodError } from 'zod';

function deepCloneUsers(users: User[]): User[] {
  return users.map((u) => ({
    ...u,
    teams: [...u.teams],
  }));
}

function deepCloneLoginConfig(config: AppConfig['login']): AppConfig['login'] {
  return { ...config };
}

function formatZodError(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export interface AdminRouterOptions {
  config: AppConfig;
  users: User[];
}

export function createAdminRouter({ config, users }: AdminRouterOptions): Router {
  // Build state object that shares references with the server
  const state: AdminState = {
    users,
    config,
    baselineUsers: deepCloneUsers(users),
    baselineConfig: { ...config, login: deepCloneLoginConfig(config.login) },
  };

  const userHandlers = createUserHandlers(state);
  const router = new Router({ prefix: '/admin/v1' });

  // JSON body parser middleware for admin routes
  router.use(async (ctx: Context, next: Next) => {
    if (ctx.method === 'POST' || ctx.method === 'PATCH' || ctx.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of ctx.req) chunks.push(chunk as Buffer);
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
      if (authHeader !== expected) {
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

  // Reset all state
  router.post('/reset', (ctx) => {
    // Restore users to baseline
    state.users.length = 0;
    for (const u of deepCloneUsers(state.baselineUsers)) {
      state.users.push(u);
    }

    // Restore login config to baseline
    state.config.login.mode = state.baselineConfig.login.mode;
    state.config.login.autoLoginUser = state.baselineConfig.login.autoLoginUser;

    // Flush OIDC state (tokens, sessions, codes)
    MemoryAdapter.flushAll();

    ctx.body = { status: 'reset', users: state.users.length };
  });

  // Reset only users
  router.post('/reset/users', (ctx) => {
    state.users.length = 0;
    for (const u of deepCloneUsers(state.baselineUsers)) {
      state.users.push(u);
    }
    ctx.body = { status: 'reset', users: state.users.length };
  });

  // Patch login config
  router.patch('/config/login', (ctx) => {
    const parsed = PatchLoginConfigBody.safeParse(ctx.request.body);
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
