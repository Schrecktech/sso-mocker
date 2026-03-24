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
