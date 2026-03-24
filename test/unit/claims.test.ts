import { describe, it, expect } from 'vitest';
import { buildUserClaims } from '../../src/oidc/claims.js';
import type { User, Role, Team } from '../../src/config/schema.js';

const REGISTRY = new Set(['read:repos', 'write:repos', 'read:ci', 'read:invoices', 'write:invoices']);

const roles: Role[] = [
  { id: 'admin', name: 'Admin', scopes: ['*'] },
  { id: 'viewer', name: 'Viewer', scopes: ['read:*'] },
];
const teams: Team[] = [
  { id: 'engineering', name: 'Engineering', scopes: ['read:repos', 'write:repos', 'read:ci'] },
  { id: 'billing', name: 'Billing', scopes: ['read:invoices', 'write:invoices'] },
];

describe('buildUserClaims', () => {
  it('builds claims for admin user', () => {
    const user: User = { id: 'alice', email: 'alice@example.com', name: 'Alice', role: 'admin', teams: ['engineering'] };
    const claims = buildUserClaims(user, roles, teams, REGISTRY);
    expect(claims.sub).toBe('alice');
    expect(claims.email).toBe('alice@example.com');
    expect(claims.name).toBe('Alice');
    expect(claims.role).toBe('admin');
    expect(claims.teams).toEqual(['engineering']);
    expect(claims.scopes).toContain('read:repos');
    expect(claims.scopes).toContain('write:invoices');
    expect(claims.team_scopes.engineering).toEqual(['read:repos', 'write:repos', 'read:ci']);
  });
  it('builds claims for viewer user', () => {
    const user: User = { id: 'carol', email: 'carol@example.com', name: 'Carol', role: 'viewer', teams: ['billing'] };
    const claims = buildUserClaims(user, roles, teams, REGISTRY);
    expect(claims.role).toBe('viewer');
    expect(claims.scopes).toContain('read:repos');
    expect(claims.scopes).toContain('write:invoices');
    expect(claims.scopes).not.toContain('write:repos');
  });
  it('tokens contain only concrete scopes, never wildcards', () => {
    const user: User = { id: 'alice', email: 'a@b.com', name: 'A', role: 'admin', teams: [] };
    const claims = buildUserClaims(user, roles, teams, REGISTRY);
    expect(claims.scopes).not.toContain('*');
    expect(claims.scopes.every((s: string) => !s.includes('*'))).toBe(true);
  });
  it('builds team_scopes map', () => {
    const user: User = { id: 'bob', email: 'b@b.com', name: 'B', role: 'viewer', teams: ['engineering', 'billing'] };
    const claims = buildUserClaims(user, roles, teams, REGISTRY);
    expect(claims.team_scopes.engineering).toEqual(['read:repos', 'write:repos', 'read:ci']);
    expect(claims.team_scopes.billing).toEqual(['read:invoices', 'write:invoices']);
  });
});
