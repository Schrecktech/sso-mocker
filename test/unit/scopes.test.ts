import { describe, it, expect } from 'vitest';
import { expandWildcard, resolveEffectiveScopes, buildScopeRegistry } from '../../src/oidc/scopes.js';
import type { Team, Role } from '../../src/config/schema.js';

const REGISTRY = new Set(['read:repos', 'write:repos', 'read:ci', 'read:invoices', 'write:invoices']);

describe('buildScopeRegistry', () => {
  it('collects scopes from teams and clients', () => {
    const teams: Team[] = [{ id: 'eng', name: 'Eng', scopes: ['read:repos', 'write:repos'] }];
    const clients = [{ clientId: 'x', clientSecret: null, redirectUris: [], grantTypes: [], scopes: ['custom:scope'], tokenEndpointAuthMethod: 'none' as const }];
    const registry = buildScopeRegistry(teams, clients);
    expect(registry.has('read:repos')).toBe(true);
    expect(registry.has('custom:scope')).toBe(true);
  });
});

describe('expandWildcard', () => {
  it('expands * to all scopes', () => {
    const result = expandWildcard('*', REGISTRY);
    expect(result).toEqual(REGISTRY);
  });
  it('expands read:* to all read: scopes', () => {
    const result = expandWildcard('read:*', REGISTRY);
    expect(result).toEqual(new Set(['read:repos', 'read:ci', 'read:invoices']));
  });
  it('returns single scope for non-wildcard', () => {
    const result = expandWildcard('read:repos', REGISTRY);
    expect(result).toEqual(new Set(['read:repos']));
  });
});

describe('resolveEffectiveScopes', () => {
  const roles: Role[] = [
    { id: 'admin', name: 'Admin', scopes: ['*'] },
    { id: 'viewer', name: 'Viewer', scopes: ['read:*'] },
  ];
  const teams: Team[] = [
    { id: 'eng', name: 'Eng', scopes: ['read:repos', 'write:repos', 'read:ci'] },
    { id: 'billing', name: 'Billing', scopes: ['read:invoices', 'write:invoices'] },
  ];

  it('admin gets all scopes', () => {
    const result = resolveEffectiveScopes('admin', ['eng'], roles, teams, REGISTRY);
    expect(result).toEqual(REGISTRY);
  });
  it('viewer gets read scopes plus team scopes', () => {
    const result = resolveEffectiveScopes('viewer', ['billing'], roles, teams, REGISTRY);
    expect(result.has('read:repos')).toBe(true);
    expect(result.has('read:invoices')).toBe(true);
    expect(result.has('write:invoices')).toBe(true);
    expect(result.has('write:repos')).toBe(false);
  });
  it('user with no teams gets only role scopes', () => {
    const result = resolveEffectiveScopes('viewer', [], roles, teams, REGISTRY);
    expect(result.has('write:invoices')).toBe(false);
    expect(result.has('read:repos')).toBe(true);
  });
  it('deduplicates scopes', () => {
    const result = resolveEffectiveScopes('viewer', ['eng'], roles, teams, REGISTRY);
    const arr = [...result];
    expect(arr.length).toBe(new Set(arr).size);
  });
});
