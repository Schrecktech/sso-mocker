import type { Context } from 'koa';
import type { AdminState } from './users.js';
import { CreateRoleBody, PatchRoleBody, formatZodError } from '../validation.js';

export function createRoleHandlers(state: AdminState) {
  return {
    list(ctx: Context): void {
      ctx.body = state.config.roles;
    },

    get(ctx: Context): void {
      const { id } = ctx.params;
      const role = state.config.roles.find((r) => r.id === id);
      if (!role) {
        ctx.status = 404;
        ctx.body = { error: `Role '${id}' not found` };
        return;
      }
      ctx.body = role;
    },

    create(ctx: Context): void {
      const parsed = CreateRoleBody.safeParse((ctx.request as any).body);
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = { error: formatZodError(parsed.error) };
        return;
      }
      const input = parsed.data;

      // Check duplicate id
      if (state.config.roles.find((r) => r.id === input.id)) {
        ctx.status = 409;
        ctx.body = { error: `Role with id '${input.id}' already exists` };
        return;
      }

      const newRole = { id: input.id, name: input.name, scopes: input.scopes };
      state.config.roles.push(newRole);
      ctx.status = 201;
      ctx.body = newRole;
    },

    update(ctx: Context): void {
      const { id } = ctx.params;
      const role = state.config.roles.find((r) => r.id === id);
      if (!role) {
        ctx.status = 404;
        ctx.body = { error: `Role '${id}' not found` };
        return;
      }

      const parsed = PatchRoleBody.safeParse((ctx.request as any).body);
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = { error: formatZodError(parsed.error) };
        return;
      }
      const input = parsed.data;

      if (input.name !== undefined) role.name = input.name;
      if (input.scopes !== undefined) role.scopes = input.scopes;

      ctx.body = role;
    },

    delete(ctx: Context): void {
      const { id } = ctx.params;
      const idx = state.config.roles.findIndex((r) => r.id === id);
      if (idx === -1) {
        ctx.status = 404;
        ctx.body = { error: `Role '${id}' not found` };
        return;
      }

      // Check if any users have this role assigned
      const usersWithRole = state.users.filter((u) => u.role === id);
      if (usersWithRole.length > 0) {
        ctx.status = 409;
        ctx.body = {
          error: `Cannot delete role '${id}': assigned to ${usersWithRole.length} user(s)`,
          users: usersWithRole.map((u) => u.id),
        };
        return;
      }

      state.config.roles.splice(idx, 1);
      ctx.status = 204;
    },
  };
}
