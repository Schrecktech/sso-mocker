import type { User, Role, Team } from '../config/schema.js';
import { resolveEffectiveScopes, expandWildcard } from './scopes.js';

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
    if (team) {
      const expanded = new Set<string>();
      for (const scope of team.scopes) {
        for (const s of expandWildcard(scope, registry)) expanded.add(s);
      }
      teamScopes[teamId] = [...expanded].sort();
    }
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
