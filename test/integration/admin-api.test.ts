import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { MockerInstance } from '../../src/server.js';
import { startTestMocker } from '../helpers/mocker.js';

describe('Admin API', () => {
  let mocker: MockerInstance;
  let base: string;

  beforeAll(async () => {
    mocker = await startTestMocker();
    base = `${mocker.issuer}/admin/v1`;
  });

  afterAll(async () => {
    await mocker.stop();
  });

  // Reset state before each test to ensure isolation
  beforeEach(async () => {
    await fetch(`${base}/reset`, { method: 'POST' });
  });

  describe('GET /admin/v1/users', () => {
    it('lists users with effectiveScopes', async () => {
      const res = await fetch(`${base}/users`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      // Every user should have effectiveScopes
      for (const user of body) {
        expect(user.effectiveScopes).toBeDefined();
        expect(Array.isArray(user.effectiveScopes)).toBe(true);
      }

      // Alice is an admin with engineering team — should have scopes
      const alice = body.find((u: any) => u.id === 'alice');
      expect(alice).toBeDefined();
      expect(alice.role).toBe('admin');
      expect(alice.effectiveScopes.length).toBeGreaterThan(0);
    });
  });

  describe('GET /admin/v1/users/:id', () => {
    it('returns a single user with effectiveScopes', async () => {
      const res = await fetch(`${base}/users/alice`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('alice');
      expect(body.effectiveScopes).toBeDefined();
    });

    it('returns 404 for nonexistent user', async () => {
      const res = await fetch(`${base}/users/nonexistent`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('POST /admin/v1/users', () => {
    it('creates a new user', async () => {
      const res = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'bob',
          email: 'bob@example.com',
          name: 'Bob Builder',
          role: 'viewer',
          teams: ['engineering'],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe('bob');
      expect(body.effectiveScopes).toBeDefined();

      // Verify user is in the list
      const listRes = await fetch(`${base}/users`);
      const list = await listRes.json();
      expect(list.find((u: any) => u.id === 'bob')).toBeDefined();
    });

    it('rejects duplicate id with 409', async () => {
      const res = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'alice',
          email: 'alice2@example.com',
          name: 'Alice Duplicate',
          role: 'viewer',
          teams: [],
        }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('already exists');
    });

    it('rejects duplicate email with 409', async () => {
      const res = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'unique-id',
          email: 'alice@example.com',
          name: 'Duplicate Email',
          role: 'viewer',
          teams: [],
        }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('already exists');
    });

    it('rejects nonexistent role with 400', async () => {
      const res = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'carol',
          email: 'carol@example.com',
          name: 'Carol',
          role: 'nonexistent-role',
          teams: [],
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('does not exist');
    });

    it('rejects nonexistent team with 400', async () => {
      const res = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'carol',
          email: 'carol@example.com',
          name: 'Carol',
          role: 'viewer',
          teams: ['nonexistent-team'],
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('does not exist');
    });

    it('rejects invalid body with 400', async () => {
      const res = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'no-email' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /admin/v1/users/:id', () => {
    it('updates a user', async () => {
      const res = await fetch(`${base}/users/alice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice Updated' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Alice Updated');
      expect(body.id).toBe('alice');
      expect(body.effectiveScopes).toBeDefined();
    });

    it('updates role and teams', async () => {
      const res = await fetch(`${base}/users/alice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'viewer', teams: ['billing'] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe('viewer');
      expect(body.teams).toEqual(['billing']);
    });

    it('returns 404 for nonexistent user', async () => {
      const res = await fetch(`${base}/users/nonexistent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ghost' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects nonexistent role', async () => {
      const res = await fetch(`${base}/users/alice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'nonexistent-role' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('does not exist');
    });
  });

  describe('DELETE /admin/v1/users/:id', () => {
    it('deletes a user', async () => {
      const res = await fetch(`${base}/users/alice`, { method: 'DELETE' });
      expect(res.status).toBe(204);

      // Verify user is gone
      const getRes = await fetch(`${base}/users/alice`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for nonexistent user', async () => {
      const res = await fetch(`${base}/users/nonexistent`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/v1/reset', () => {
    it('restores users to baseline after modifications', async () => {
      // Get initial count
      const initialRes = await fetch(`${base}/users`);
      const initialUsers = await initialRes.json();
      const initialCount = initialUsers.length;

      // Add a user
      await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'temp-user',
          email: 'temp@example.com',
          name: 'Temp User',
          role: 'viewer',
          teams: [],
        }),
      });

      // Verify user was added
      const afterAdd = await fetch(`${base}/users`);
      const afterAddUsers = await afterAdd.json();
      expect(afterAddUsers.length).toBe(initialCount + 1);

      // Reset
      const resetRes = await fetch(`${base}/reset`, { method: 'POST' });
      expect(resetRes.status).toBe(200);
      const resetBody = await resetRes.json();
      expect(resetBody.status).toBe('reset');

      // Verify users are restored
      const afterReset = await fetch(`${base}/users`);
      const afterResetUsers = await afterReset.json();
      expect(afterResetUsers.length).toBe(initialCount);
      expect(afterResetUsers.find((u: any) => u.id === 'temp-user')).toBeUndefined();
    });

    it('restores login config to baseline', async () => {
      // Change login config
      await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'form' }),
      });

      // Reset
      await fetch(`${base}/reset`, { method: 'POST' });

      // Login config should be back to baseline (auto for integration env)
      const loginRes = await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const loginBody = await loginRes.json();
      expect(loginBody.mode).toBe('auto');
    });
  });

  describe('POST /admin/v1/reset/users', () => {
    it('resets only users, not login config', async () => {
      // Change login config
      await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'form' }),
      });

      // Add a user
      await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'temp-user2',
          email: 'temp2@example.com',
          name: 'Temp User 2',
          role: 'viewer',
          teams: [],
        }),
      });

      // Reset only users
      const resetRes = await fetch(`${base}/reset/users`, { method: 'POST' });
      expect(resetRes.status).toBe(200);
      const resetBody = await resetRes.json();
      expect(resetBody.status).toBe('reset');

      // Verify users are restored
      const usersRes = await fetch(`${base}/users`);
      const users = await usersRes.json();
      expect(users.find((u: any) => u.id === 'temp-user2')).toBeUndefined();

      // Login config should still be changed (form mode)
      const loginRes = await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const loginBody = await loginRes.json();
      expect(loginBody.mode).toBe('form');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Roles CRUD
  // ──────────────────────────────────────────────────────────────────

  describe('GET /admin/v1/roles', () => {
    it('lists all roles', async () => {
      const res = await fetch(`${base}/roles`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(3); // admin, editor, viewer
      const ids = body.map((r: any) => r.id);
      expect(ids).toContain('admin');
      expect(ids).toContain('editor');
      expect(ids).toContain('viewer');
    });
  });

  describe('GET /admin/v1/roles/:id', () => {
    it('returns a single role', async () => {
      const res = await fetch(`${base}/roles/admin`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('admin');
      expect(body.name).toBe('Administrator');
      expect(Array.isArray(body.scopes)).toBe(true);
    });

    it('returns 404 for nonexistent role', async () => {
      const res = await fetch(`${base}/roles/nonexistent`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('POST /admin/v1/roles', () => {
    it('creates a new role', async () => {
      const res = await fetch(`${base}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'tester',
          name: 'Tester',
          scopes: ['read:tests', 'write:tests'],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe('tester');
      expect(body.name).toBe('Tester');
      expect(body.scopes).toEqual(['read:tests', 'write:tests']);

      // Verify role is in the list
      const listRes = await fetch(`${base}/roles`);
      const list = await listRes.json();
      expect(list.find((r: any) => r.id === 'tester')).toBeDefined();
    });

    it('rejects duplicate id with 409', async () => {
      const res = await fetch(`${base}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'admin',
          name: 'Duplicate Admin',
          scopes: [],
        }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('already exists');
    });

    it('rejects invalid body with 400', async () => {
      const res = await fetch(`${base}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'no-name' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /admin/v1/roles/:id', () => {
    it('updates a role', async () => {
      const res = await fetch(`${base}/roles/viewer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Read-Only User' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Read-Only User');
      expect(body.id).toBe('viewer');
    });

    it('updates scopes', async () => {
      const res = await fetch(`${base}/roles/viewer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: ['read:limited'] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scopes).toEqual(['read:limited']);
    });

    it('returns 404 for nonexistent role', async () => {
      const res = await fetch(`${base}/roles/nonexistent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ghost' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /admin/v1/roles/:id', () => {
    it('deletes an unassigned role', async () => {
      // editor role is not assigned to any integration fixture users
      const res = await fetch(`${base}/roles/editor`, { method: 'DELETE' });
      expect(res.status).toBe(204);

      // Verify role is gone
      const getRes = await fetch(`${base}/roles/editor`);
      expect(getRes.status).toBe(404);
    });

    it('returns 409 when deleting a role assigned to users', async () => {
      // admin role is assigned to alice and test-admin
      const res = await fetch(`${base}/roles/admin`, { method: 'DELETE' });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('assigned to');
      expect(body.users).toBeDefined();
      expect(body.users).toContain('alice');
    });

    it('returns 404 for nonexistent role', async () => {
      const res = await fetch(`${base}/roles/nonexistent`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/v1/reset/roles', () => {
    it('restores roles to baseline after modifications', async () => {
      // Get initial count
      const initialRes = await fetch(`${base}/roles`);
      const initialRoles = await initialRes.json();
      const initialCount = initialRoles.length;

      // Add a role
      await fetch(`${base}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'temp-role',
          name: 'Temp Role',
          scopes: ['temp:scope'],
        }),
      });

      // Verify role was added
      const afterAdd = await fetch(`${base}/roles`);
      const afterAddRoles = await afterAdd.json();
      expect(afterAddRoles.length).toBe(initialCount + 1);

      // Reset roles
      const resetRes = await fetch(`${base}/reset/roles`, { method: 'POST' });
      expect(resetRes.status).toBe(200);
      const resetBody = await resetRes.json();
      expect(resetBody.status).toBe('reset');

      // Verify roles are restored
      const afterReset = await fetch(`${base}/roles`);
      const afterResetRoles = await afterReset.json();
      expect(afterResetRoles.length).toBe(initialCount);
      expect(afterResetRoles.find((r: any) => r.id === 'temp-role')).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Teams CRUD
  // ──────────────────────────────────────────────────────────────────

  describe('GET /admin/v1/teams', () => {
    it('lists all teams', async () => {
      const res = await fetch(`${base}/teams`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2); // engineering, billing
      const ids = body.map((t: any) => t.id);
      expect(ids).toContain('engineering');
      expect(ids).toContain('billing');
    });
  });

  describe('GET /admin/v1/teams/:id', () => {
    it('returns a single team', async () => {
      const res = await fetch(`${base}/teams/engineering`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('engineering');
      expect(body.name).toBe('Engineering');
      expect(Array.isArray(body.scopes)).toBe(true);
    });

    it('returns 404 for nonexistent team', async () => {
      const res = await fetch(`${base}/teams/nonexistent`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('GET /admin/v1/teams/:id/members', () => {
    it('returns members of a team', async () => {
      const res = await fetch(`${base}/teams/engineering/members`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      // alice and test-admin are in the engineering team
      const ids = body.map((u: any) => u.id);
      expect(ids).toContain('alice');
      expect(ids).toContain('test-admin');
    });

    it('returns empty array for team with no members', async () => {
      // billing team has no users assigned in integration fixtures
      const res = await fetch(`${base}/teams/billing/members`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });

    it('returns 404 for nonexistent team', async () => {
      const res = await fetch(`${base}/teams/nonexistent/members`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('POST /admin/v1/teams', () => {
    it('creates a new team', async () => {
      const res = await fetch(`${base}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'qa',
          name: 'Quality Assurance',
          scopes: ['read:tests', 'write:tests'],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe('qa');
      expect(body.name).toBe('Quality Assurance');
      expect(body.scopes).toEqual(['read:tests', 'write:tests']);

      // Verify team is in the list
      const listRes = await fetch(`${base}/teams`);
      const list = await listRes.json();
      expect(list.find((t: any) => t.id === 'qa')).toBeDefined();
    });

    it('rejects duplicate id with 409', async () => {
      const res = await fetch(`${base}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'engineering',
          name: 'Duplicate Engineering',
          scopes: [],
        }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('already exists');
    });

    it('rejects invalid body with 400', async () => {
      const res = await fetch(`${base}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'no-name' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /admin/v1/teams/:id', () => {
    it('updates a team', async () => {
      const res = await fetch(`${base}/teams/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Finance & Billing' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Finance & Billing');
      expect(body.id).toBe('billing');
    });

    it('updates scopes', async () => {
      const res = await fetch(`${base}/teams/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: ['read:invoices', 'write:invoices', 'read:payments'] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scopes).toEqual(['read:invoices', 'write:invoices', 'read:payments']);
    });

    it('returns 404 for nonexistent team', async () => {
      const res = await fetch(`${base}/teams/nonexistent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ghost' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /admin/v1/teams/:id', () => {
    it('deletes a team with no members', async () => {
      // billing team has no users in integration fixtures
      const res = await fetch(`${base}/teams/billing`, { method: 'DELETE' });
      expect(res.status).toBe(204);

      // Verify team is gone
      const getRes = await fetch(`${base}/teams/billing`);
      expect(getRes.status).toBe(404);
    });

    it('returns 409 when deleting a team with members', async () => {
      // engineering team has alice and test-admin
      const res = await fetch(`${base}/teams/engineering`, { method: 'DELETE' });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('member(s)');
      expect(body.users).toBeDefined();
      expect(body.users).toContain('alice');
    });

    it('returns 404 for nonexistent team', async () => {
      const res = await fetch(`${base}/teams/nonexistent`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/v1/reset/teams', () => {
    it('restores teams to baseline after modifications', async () => {
      // Get initial count
      const initialRes = await fetch(`${base}/teams`);
      const initialTeams = await initialRes.json();
      const initialCount = initialTeams.length;

      // Add a team
      await fetch(`${base}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'temp-team',
          name: 'Temp Team',
          scopes: ['temp:scope'],
        }),
      });

      // Verify team was added
      const afterAdd = await fetch(`${base}/teams`);
      const afterAddTeams = await afterAdd.json();
      expect(afterAddTeams.length).toBe(initialCount + 1);

      // Reset teams
      const resetRes = await fetch(`${base}/reset/teams`, { method: 'POST' });
      expect(resetRes.status).toBe(200);
      const resetBody = await resetRes.json();
      expect(resetBody.status).toBe('reset');

      // Verify teams are restored
      const afterReset = await fetch(`${base}/teams`);
      const afterResetTeams = await afterReset.json();
      expect(afterResetTeams.length).toBe(initialCount);
      expect(afterResetTeams.find((t: any) => t.id === 'temp-team')).toBeUndefined();
    });
  });

  describe('PATCH /admin/v1/config/login', () => {
    it('changes autoLoginUser', async () => {
      const res = await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoLoginUser: 'test-viewer' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.autoLoginUser).toBe('test-viewer');
    });

    it('changes login mode', async () => {
      const res = await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'form' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBe('form');
    });

    it('rejects nonexistent user for autoLoginUser', async () => {
      const res = await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoLoginUser: 'nonexistent-user' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });

    it('returns current config on empty patch', async () => {
      const res = await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBeDefined();
      expect(body.autoLoginUser).toBeDefined();
    });
  });
});
