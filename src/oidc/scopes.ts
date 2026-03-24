import type { Team, Role, Client } from '../config/schema.js';

export function buildScopeRegistry(teams: Team[], clients: Client[]): Set<string> {
  const scopes = new Set<string>();
  for (const team of teams) {
    for (const scope of team.scopes) {
      if (!scope.includes('*')) scopes.add(scope);
    }
  }
  for (const client of clients) {
    for (const scope of client.scopes) {
      scopes.add(scope);
    }
  }
  return scopes;
}

export function expandWildcard(pattern: string, registry: Set<string>): Set<string> {
  if (pattern === '*') return new Set(registry);
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1);
    const matched = new Set<string>();
    for (const scope of registry) {
      if (scope.startsWith(prefix)) matched.add(scope);
    }
    return matched;
  }
  return new Set([pattern]);
}

export function resolveEffectiveScopes(
  roleId: string,
  teamIds: string[],
  roles: Role[],
  teams: Team[],
  registry: Set<string>,
): Set<string> {
  const result = new Set<string>();
  const role = roles.find((r) => r.id === roleId);
  if (role) {
    for (const scope of role.scopes) {
      for (const expanded of expandWildcard(scope, registry)) result.add(expanded);
    }
  }
  for (const teamId of teamIds) {
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      for (const scope of team.scopes) {
        for (const expanded of expandWildcard(scope, registry)) result.add(expanded);
      }
    }
  }
  return result;
}
