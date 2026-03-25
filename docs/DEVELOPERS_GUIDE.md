# Developer's Guide

How to integrate SSO Mocker into your app and test suites.

## Prerequisites

- Your app uses an OIDC client library (e.g., `openid-client`, `next-auth`, `passport-openidconnect`, `oidc-client-ts`)
- Node.js 22+ (for npx usage) or Docker

## Connecting Your App

Point your OIDC client library at the mocker's discovery URL:

```
http://localhost:9090/.well-known/openid-configuration
```

The discovery document provides all endpoint URLs automatically. Most OIDC client libraries auto-configure from this single URL.

### Example: openid-client (v6+)

```typescript
import * as client from 'openid-client';

const config = await client.discovery(
  new URL('http://localhost:9090'),
  'my-spa'
);
// config is now ready for authorization code flow with PKCE
```

### Example: Environment Variable Pattern

Most apps should select the OIDC issuer via environment variable:

```typescript
const issuerUrl = process.env.OIDC_ISSUER || 'http://localhost:9090';
```

In production, set `OIDC_ISSUER` to your real IdP. In dev/CI, it points to SSO Mocker.

## Default Users

The development config includes these user personas:

| ID | Name | Role | Teams | Use For |
|---|---|---|---|---|
| `alice` | Alice Admin | admin | engineering | Testing admin-level access |
| `bob` | Bob Editor | editor | engineering, billing | Testing cross-team access |
| `carol` | Carol Viewer | viewer | billing | Testing read-only access |

## Token Claims

When a user authenticates, the ID token and userinfo endpoint return:

```json
{
  "sub": "alice",
  "email": "alice@example.com",
  "name": "Alice Admin",
  "role": "admin",
  "teams": ["engineering"],
  "scopes": ["*"],
  "team_scopes": {
    "engineering": ["read:repos", "write:repos", "read:ci"]
  }
}
```

**Effective scopes** are the union of the user's role scopes and all their team scopes.

## Authorization Patterns

Your app can check authorization using any combination:

```typescript
// Role-based
if (claims.role === 'admin') { /* full access */ }

// Scope-based
if (claims.scopes.includes('write:invoices')) { /* can write invoices */ }

// Team-based
if (claims.teams.includes('engineering')) { /* is on engineering team */ }

// Team-scoped permissions
if (claims.team_scopes['billing']?.includes('read:invoices')) { /* billing team read */ }
```

## Admin API Reference

Base URL: `http://localhost:9090/admin/v1`

All endpoints accept and return JSON. Content-Type: `application/json`.

### Users

```http
GET    /admin/v1/users              # List all users
GET    /admin/v1/users/:id          # Get user by ID
POST   /admin/v1/users              # Create user
PATCH  /admin/v1/users/:id          # Update user (partial)
DELETE /admin/v1/users/:id          # Delete user
```

**Create user:**

```bash
curl -X POST http://localhost:9090/admin/v1/users \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "dave",
    "email": "dave@example.com",
    "name": "Dave Developer",
    "role": "editor",
    "teams": ["engineering"]
  }'
```

Response includes computed `effectiveScopes`:

```json
{
  "id": "dave",
  "email": "dave@example.com",
  "name": "Dave Developer",
  "role": "editor",
  "teams": ["engineering"],
  "effectiveScopes": ["read:*", "write:*", "read:repos", "write:repos", "read:ci"]
}
```

**Update user:**

```bash
curl -X PATCH http://localhost:9090/admin/v1/users/dave \
  -H 'Content-Type: application/json' \
  -d '{"role": "viewer"}'
```

### Roles

```http
GET    /admin/v1/roles              # List all roles
GET    /admin/v1/roles/:id          # Get role
POST   /admin/v1/roles              # Create role
PATCH  /admin/v1/roles/:id          # Update role
DELETE /admin/v1/roles/:id          # Delete (fails if users assigned, 409)
```

### Teams

```http
GET    /admin/v1/teams              # List all teams
GET    /admin/v1/teams/:id          # Get team
POST   /admin/v1/teams              # Create team
PATCH  /admin/v1/teams/:id          # Update team
DELETE /admin/v1/teams/:id          # Delete (fails if users assigned, 409)
GET    /admin/v1/teams/:id/members  # List team members
```

### Clients

```http
GET    /admin/v1/clients            # List all OIDC clients
GET    /admin/v1/clients/:id        # Get client
POST   /admin/v1/clients            # Register client
PATCH  /admin/v1/clients/:id        # Update client
DELETE /admin/v1/clients/:id        # Remove client
```

### State Reset

```http
POST   /admin/v1/reset              # Reset ALL state to config baseline
POST   /admin/v1/reset/users        # Reset only users
POST   /admin/v1/reset/roles        # Reset only roles
POST   /admin/v1/reset/teams        # Reset only teams
POST   /admin/v1/reset/clients      # Reset only clients
```

**Full reset (`POST /admin/v1/reset`) clears everything:** users, roles, teams, clients restored to config baseline AND all issued tokens, sessions, and authorization codes are invalidated. This ensures complete test isolation.

### Runtime Config

```http
PATCH  /admin/v1/config/login       # Change login mode / autoLoginUser
```

```bash
curl -X PATCH http://localhost:9090/admin/v1/config/login \
  -H 'Content-Type: application/json' \
  -d '{"autoLoginUser": "carol"}'
```

### Error Responses

All errors return structured JSON:

```json
{
  "error": "validation_error",
  "message": "Role 'superadmin' does not exist",
  "details": [
    {
      "field": "role",
      "value": "superadmin",
      "constraint": "must reference an existing role"
    }
  ]
}
```

## Integration Testing

### Pattern: Reset Between Tests

```typescript
beforeEach(async () => {
  await fetch('http://localhost:9090/admin/v1/reset', { method: 'POST' });
});
```

### Pattern: Custom User Per Test

```typescript
test('viewer cannot delete', async () => {
  // Create a specific user for this test
  await fetch('http://localhost:9090/admin/v1/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'test-viewer',
      email: 'viewer@test.local',
      name: 'Test Viewer',
      role: 'viewer',
      teams: []
    })
  });

  // Authenticate as this user and test your app...
});
```

### Pattern: Programmatic Mocker in Test Suite

```typescript
import { createMocker, Mocker } from '@schrecktech/sso-mocker';

let mocker: Mocker;

beforeAll(async () => {
  mocker = await createMocker({
    env: 'integration',
    port: 0,               // Random port, no conflicts
    loginMode: 'auto',
    autoLoginUser: 'alice'
  });
  await mocker.start();
  process.env.OIDC_ISSUER = mocker.issuer;
});

afterAll(async () => {
  await mocker.stop();
});
```

## Playwright Testing

### Auto-Login Mode (CI)

With `SSO_MOCKER_LOGIN_MODE=auto`, the mocker skips the login UI entirely. Your Playwright tests authenticate transparently:

```typescript
test('dashboard loads for authenticated user', async ({ page }) => {
  await page.goto('http://localhost:3000');
  // OIDC redirect happens automatically, user is authenticated as alice
  await expect(page.locator('h1')).toHaveText('Dashboard');
});
```

### Form Mode (Switching Users)

With `SSO_MOCKER_LOGIN_MODE=form`, Playwright can interact with the login picker:

```typescript
import { loginAs } from './helpers/auth';

test('admin sees settings', async ({ page }) => {
  await loginAs(page, 'alice');
  await page.goto('/settings');
  await expect(page.locator('h1')).toHaveText('Settings');
});

test('viewer cannot see settings', async ({ page }) => {
  await loginAs(page, 'carol');
  await page.goto('/settings');
  await expect(page.locator('.error')).toHaveText('Access denied');
});
```

The `loginAs` helper:

```typescript
export async function loginAs(page: Page, userId: string) {
  await page.goto(process.env.BASE_URL!);
  if (page.url().includes('/interaction/')) {
    await page.click(`[data-testid="user-${userId}"]`);
    await page.click('[data-testid="sign-in"]');
  }
  await page.waitForURL(`${process.env.BASE_URL}/**`);
}
```

### Switching Users via Admin API (Auto Mode)

```typescript
test('admin flow', async ({ page }) => {
  await fetch(`${process.env.OIDC_ISSUER}/admin/v1/config/login`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoLoginUser: 'alice' })
  });
  await page.goto(process.env.BASE_URL!);
  // Authenticated as alice
});
```

## GitHub Actions Integration

### Service Container (Recommended)

```yaml
services:
  sso-mocker:
    image: ghcr.io/schrecktech/sso-mocker:latest
    env:
      SSO_MOCKER_ENV: integration
      SSO_MOCKER_LOGIN_MODE: auto
    ports:
      - 9090:9090
    options: >-
      --health-cmd "curl -f http://localhost:9090/.well-known/openid-configuration || exit 1"
      --health-interval 5s
      --health-timeout 3s
      --health-retries 5
```

### Background Process (No Docker)

```yaml
- name: Start SSO Mocker
  run: |
    npx @schrecktech/sso-mocker start --env integration &
    timeout 30 bash -c 'until curl -sf http://localhost:9090/.well-known/openid-configuration; do sleep 1; done'
```

## Default Clients

| Client ID | Type | Auth Method | Grant Types |
|---|---|---|---|
| `my-spa` | Public | none (PKCE) | authorization_code |
| `my-backend` | Confidential | client_secret_basic | client_credentials |

Register additional clients via config files or the Admin API.
