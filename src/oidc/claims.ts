import type { User, Role, Team } from '../config/schema.js';
import { resolveEffectiveScopes } from './scopes.js';

export interface UserClaims {
  sub: string;
  email: string;
  name: string;
  role: string;
  teams: string[];
  scopes: string[];
  team_scopes: Record<string, string[]>;
}

export function buildUserClaims(
  user: User, roles: Role[], teams: Team[], registry: Set<string>,
): UserClaims {
  const effectiveScopes = resolveEffectiveScopes(user.role, user.teams, roles, teams, registry);
  const teamScopes: Record<string, string[]> = {};
  for (const teamId of user.teams) {
    const team = teams.find((t) => t.id === teamId);
    if (team) teamScopes[teamId] = [...team.scopes];
  }
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teams: [...user.teams],
    scopes: [...effectiveScopes].sort(),
    team_scopes: teamScopes,
  };
}
