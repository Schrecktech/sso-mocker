import type { Context } from 'koa';
import type { AdminState } from './users.js';
import { CreateTeamBody, PatchTeamBody } from '../validation.js';
import { ZodError } from 'zod';

function formatZodError(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function createTeamHandlers(state: AdminState) {
  return {
    list(ctx: Context): void {
      ctx.body = state.config.teams;
    },

    get(ctx: Context): void {
      const { id } = ctx.params;
      const team = state.config.teams.find((t) => t.id === id);
      if (!team) {
        ctx.status = 404;
        ctx.body = { error: `Team '${id}' not found` };
        return;
      }
      ctx.body = team;
    },

    create(ctx: Context): void {
      const parsed = CreateTeamBody.safeParse(ctx.request.body);
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = { error: formatZodError(parsed.error) };
        return;
      }
      const input = parsed.data;

      // Check duplicate id
      if (state.config.teams.find((t) => t.id === input.id)) {
        ctx.status = 409;
        ctx.body = { error: `Team with id '${input.id}' already exists` };
        return;
      }

      const newTeam = { id: input.id, name: input.name, scopes: input.scopes };
      state.config.teams.push(newTeam);
      ctx.status = 201;
      ctx.body = newTeam;
    },

    update(ctx: Context): void {
      const { id } = ctx.params;
      const team = state.config.teams.find((t) => t.id === id);
      if (!team) {
        ctx.status = 404;
        ctx.body = { error: `Team '${id}' not found` };
        return;
      }

      const parsed = PatchTeamBody.safeParse(ctx.request.body);
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = { error: formatZodError(parsed.error) };
        return;
      }
      const input = parsed.data;

      if (input.name !== undefined) team.name = input.name;
      if (input.scopes !== undefined) team.scopes = input.scopes;

      ctx.body = team;
    },

    delete(ctx: Context): void {
      const { id } = ctx.params;
      const idx = state.config.teams.findIndex((t) => t.id === id);
      if (idx === -1) {
        ctx.status = 404;
        ctx.body = { error: `Team '${id}' not found` };
        return;
      }

      // Check if any users are members of this team
      const usersInTeam = state.users.filter((u) => u.teams.includes(id));
      if (usersInTeam.length > 0) {
        ctx.status = 409;
        ctx.body = {
          error: `Cannot delete team '${id}': has ${usersInTeam.length} member(s)`,
          users: usersInTeam.map((u) => u.id),
        };
        return;
      }

      state.config.teams.splice(idx, 1);
      ctx.status = 204;
    },

    members(ctx: Context): void {
      const { id } = ctx.params;
      const team = state.config.teams.find((t) => t.id === id);
      if (!team) {
        ctx.status = 404;
        ctx.body = { error: `Team '${id}' not found` };
        return;
      }

      const members = state.users.filter((u) => u.teams.includes(id));
      ctx.body = members;
    },
  };
}
