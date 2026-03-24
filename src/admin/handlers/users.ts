import type { Context } from 'koa';
import type { User, AppConfig } from '../../config/schema.js';
import { resolveEffectiveScopes, buildScopeRegistry } from '../../oidc/scopes.js';
import { CreateUserBody, PatchUserBody } from '../validation.js';
import { ZodError } from 'zod';

export interface AdminState {
  users: User[];
  config: AppConfig;
  baselineUsers: User[];
  baselineConfig: AppConfig;
}

function userWithEffectiveScopes(user: User, config: AppConfig) {
  const registry = buildScopeRegistry(config.teams, config.clients);
  const scopes = resolveEffectiveScopes(user.role, user.teams, config.roles, config.teams, registry);
  return {
    ...user,
    effectiveScopes: [...scopes].sort(),
  };
}

function formatZodError(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function createUserHandlers(state: AdminState) {
  return {
    list(ctx: Context): void {
      ctx.body = state.users.map((u) => userWithEffectiveScopes(u, state.config));
    },

    get(ctx: Context): void {
      const { id } = ctx.params;
      const user = state.users.find((u) => u.id === id);
      if (!user) {
        ctx.status = 404;
        ctx.body = { error: `User '${id}' not found` };
        return;
      }
      ctx.body = userWithEffectiveScopes(user, state.config);
    },

    create(ctx: Context): void {
      const parsed = CreateUserBody.safeParse((ctx.request as any).body);
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = { error: formatZodError(parsed.error) };
        return;
      }
      const input = parsed.data;

      // Check duplicate id
      if (state.users.find((u) => u.id === input.id)) {
        ctx.status = 409;
        ctx.body = { error: `User with id '${input.id}' already exists` };
        return;
      }

      // Check duplicate email
      if (state.users.find((u) => u.email === input.email)) {
        ctx.status = 409;
        ctx.body = { error: `User with email '${input.email}' already exists` };
        return;
      }

      // Validate role exists
      if (!state.config.roles.find((r) => r.id === input.role)) {
        ctx.status = 400;
        ctx.body = { error: `Role '${input.role}' does not exist` };
        return;
      }

      // Validate teams exist
      for (const teamId of input.teams) {
        if (!state.config.teams.find((t) => t.id === teamId)) {
          ctx.status = 400;
          ctx.body = { error: `Team '${teamId}' does not exist` };
          return;
        }
      }

      const newUser: User = {
        id: input.id,
        email: input.email,
        name: input.name,
        role: input.role,
        teams: input.teams,
      };
      state.users.push(newUser);
      ctx.status = 201;
      ctx.body = userWithEffectiveScopes(newUser, state.config);
    },

    update(ctx: Context): void {
      const { id } = ctx.params;
      const idx = state.users.findIndex((u) => u.id === id);
      if (idx === -1) {
        ctx.status = 404;
        ctx.body = { error: `User '${id}' not found` };
        return;
      }

      const parsed = PatchUserBody.safeParse((ctx.request as any).body);
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = { error: formatZodError(parsed.error) };
        return;
      }
      const input = parsed.data;

      // Validate role if provided
      if (input.role && !state.config.roles.find((r) => r.id === input.role)) {
        ctx.status = 400;
        ctx.body = { error: `Role '${input.role}' does not exist` };
        return;
      }

      // Validate teams if provided
      if (input.teams) {
        for (const teamId of input.teams) {
          if (!state.config.teams.find((t) => t.id === teamId)) {
            ctx.status = 400;
            ctx.body = { error: `Team '${teamId}' does not exist` };
            return;
          }
        }
      }

      // Check email uniqueness if changing email
      if (input.email) {
        const existing = state.users.find((u) => u.email === input.email && u.id !== id);
        if (existing) {
          ctx.status = 409;
          ctx.body = { error: `User with email '${input.email}' already exists` };
          return;
        }
      }

      const user = state.users[idx];
      if (input.email !== undefined) user.email = input.email;
      if (input.name !== undefined) user.name = input.name;
      if (input.role !== undefined) user.role = input.role;
      if (input.teams !== undefined) user.teams = input.teams;

      ctx.body = userWithEffectiveScopes(user, state.config);
    },

    delete(ctx: Context): void {
      const { id } = ctx.params;
      const idx = state.users.findIndex((u) => u.id === id);
      if (idx === -1) {
        ctx.status = 404;
        ctx.body = { error: `User '${id}' not found` };
        return;
      }
      state.users.splice(idx, 1);
      ctx.status = 204;
    },
  };
}
