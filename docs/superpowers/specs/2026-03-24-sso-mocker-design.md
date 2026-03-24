# SSO Mocker Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Author:** scoschre + Claude

## Overview

SSO Mocker is a configurable OIDC (OpenID Connect) identity provider built on top of `oidc-provider` (MIT, panva/node-oidc-provider). It serves as a mock SSO provider for local development, CI/CD integration testing in GitHub Actions, and deployable service for demo/staging/production environments.

### Goals

- Provide a fully compliant OIDC provider that apps can authenticate and authorize against without a real IdP
- Support RBAC roles with scoped permissions tied to teams
- Run identically across local dev, GitHub Actions CI, and EKS (Kubernetes) deployments
- Publish as both an npm package (GitHub Packages) and Docker image (GHCR)
- Prevent test fixtures from leaking into production via structural enforcement

### Non-Goals

- Replacing a real IdP in production (this is a mock)
- SAML support (OIDC only)
- Performance/load testing targets (it needs to work, not be fast at scale)

---

## 1. Architecture

Single Node.js/TypeScript process serving three concerns through one HTTP server:

```
+---------------------------------------------------------+
|                      SSO Mocker                         |
|                                                         |
|  +-------------+  +-------------+  +----------------+  |
|  |  OIDC Core  |  |  Admin API  |  |   Login UI     |  |
|  | (oidc-      |  | /admin/v1/  |  |  /interaction  |  |
|  |  provider)  |  |             |  |  /login        |  |
|  |             |  |  users,     |  |                |  |
|  | /authorize  |  |  roles,     |  |  Auto-login    |  |
|  | /token      |  |  teams,     |  |  mode (CI)     |  |
|  | /userinfo   |  |  clients    |  |                |  |
|  | /jwks       |  |             |  |  Form picker   |  |
|  | /.well-     |  |             |  |  mode (dev)    |  |
|  |  known/     |  |             |  |                |  |
|  +------+------+  +------+------+  +-------+--------+  |
|         |                |                  |           |
|  +------v----------------v------------------v--------+  |
|  |              Storage Adapter                      |  |
|  |  +---------------+    +------------------------+  |  |
|  |  |  In-Memory    |    |   Redis                |  |  |
|  |  |  (dev / CI)   |    |   (staging / integ)    |  |  |
|  |  +---------------+    +------------------------+  |  |
|  +---------------------------------------------------+  |
|                                                         |
|  +---------------------------------------------------+  |
|  |           Configuration Loader                    |  |
|  |  config/{environment}.yaml -> seed data + settings|  |
|  +---------------------------------------------------+  |
+---------------------------------------------------------+
```

### Key Decisions

- **Single process:** Login UI is server-rendered HTML served by the same app hosting OIDC endpoints. No separate frontend deployment.
- **In-memory store for dev/CI:** No database needed. State resets on restart, making CI runs deterministic.
- **Redis adapter for staging/integration:** Multiple replicas behind a load balancer share sessions, auth codes, and tokens via Redis. `oidc-provider`'s adapter interface (`find`, `upsert`, `destroy`, `consume`) makes this pluggable.
- **Stateless containers:** All state lives in Redis (or memory). Containers can be killed/restarted freely.
- **Shared signing keys for multi-replica:** Loaded from config/secrets so all replicas sign tokens identically.

---

## 2. Configuration & Data Model

### Config File Structure

```
config/
  default.yaml              # Structure only: teams, roles, scopes, clients
  development.yaml          # Overrides + references dev fixtures
  integration.yaml          # Overrides + references CI fixtures
  staging.yaml              # Overrides + optional sparse fixtures
  production.yaml           # Overrides + NO fixtures (enforced)
fixtures/
  development.users.yaml    # Full test personas for local dev
  integration.users.yaml    # CI-specific personas
  staging.users.yaml        # Optional, sparse
```

### Separation: Structure vs. Fixtures

**Structure** (teams, roles, scopes, clients) lives in `default.yaml` and is shared across all environments. **User fixtures** (personas with role/team assignments) live in per-environment fixture files.

This prevents test users from leaking into production.

### Fixture Loading Rules

| Environment | default.yaml | {env}.yaml | fixtures/{env}.users.yaml |
|---|---|---|---|
| development | Loaded | Merged | Loaded |
| integration | Loaded | Merged | Loaded |
| staging | Loaded | Merged | Optional (warn) |
| production | Loaded | Merged | REJECTED (hard fail) |

**Production hard gate:** If `SSO_MOCKER_ENV=production` and a fixtures file exists or users are defined in any config file, the server refuses to start:

```
Error: User fixtures are not allowed in production environment.
Create users via the Admin API instead.
```

### Config Layering (default.yaml)

```yaml
server:
  port: 9090
  issuer: "http://localhost:9090"

storage:
  adapter: "memory"               # "memory" | "redis"

login:
  mode: "form"                    # "auto" | "form"
  autoLoginUser: "alice"          # Used when mode is "auto"

signing:
  keys: []                        # JWK set; empty = auto-generate

tokens:
  idToken:
    ttl: 3600
  accessToken:
    ttl: 3600
    format: "jwt"                 # "jwt" | "opaque"
  refreshToken:
    ttl: 86400
    enabled: true

clients:
  - clientId: "my-spa"
    clientSecret: null            # Public client (PKCE)
    redirectUris:
      - "http://localhost:3000/callback"
    grantTypes:
      - "authorization_code"
    tokenEndpointAuthMethod: "none"

  - clientId: "my-backend"
    clientSecret: "backend-secret"
    grantTypes:
      - "client_credentials"
    scopes:
      - "read:users"
      - "write:orders"
    tokenEndpointAuthMethod: "client_secret_basic"

teams:
  - id: "engineering"
    name: "Engineering"
    scopes: ["read:repos", "write:repos", "read:ci"]

  - id: "billing"
    name: "Billing"
    scopes: ["read:invoices", "write:invoices"]

roles:
  - id: "admin"
    name: "Administrator"
    scopes: ["*"]

  - id: "editor"
    name: "Editor"
    scopes: ["read:*", "write:*"]

  - id: "viewer"
    name: "Viewer"
    scopes: ["read:*"]

admin:
  enabled: true
  apiKey: null                    # null = no auth required
```

### Fixture File (e.g., fixtures/development.users.yaml)

```yaml
users:
  - id: "alice"
    email: "alice@example.com"
    name: "Alice Admin"
    role: "admin"
    teams: ["engineering"]

  - id: "bob"
    email: "bob@example.com"
    name: "Bob Editor"
    role: "editor"
    teams: ["engineering", "billing"]

  - id: "carol"
    email: "carol@example.com"
    name: "Carol Viewer"
    role: "viewer"
    teams: ["billing"]
```

### Environment-Specific Override (e.g., config/staging.yaml)

```yaml
server:
  port: 9090
  issuer: "https://sso-mocker.staging.example.com"

storage:
  adapter: "redis"
  redis:
    url: "${REDIS_URL}"

login:
  mode: "form"

signing:
  keys: "${SIGNING_KEYS_JSON}"

admin:
  enabled: true
  apiKey: "${ADMIN_API_KEY}"
```

### Data Model Relationships

```
User -- has one --> Role -- has many --> Scopes
  |
  +-- belongs to many --> Team -- has many --> Scopes

Client -- has many --> Grant Types
       -- has many --> Redirect URIs
       -- has many --> Allowed Scopes
```

### Token Claims

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

**Effective scopes** = union of role scopes + all team scopes. Wildcards (`*`, `read:*`) are expanded at token-build time.

### Config Precedence (last wins)

```
1. config/default.yaml                    # Base structure
2. config/{SSO_MOCKER_ENV}.yaml           # Environment overrides
3. fixtures/{SSO_MOCKER_ENV}.users.yaml   # User fixtures (if allowed)
4. Environment variables (SSO_MOCKER_*)   # Runtime overrides
5. CLI flags (--port, --login-mode, etc.) # Highest priority
```

### Environment Variable Mapping

| Env Var | Config Path | Example |
|---|---|---|
| `SSO_MOCKER_ENV` | selects config file | `integration` |
| `SSO_MOCKER_PORT` | `server.port` | `8080` |
| `SSO_MOCKER_ISSUER` | `server.issuer` | `https://sso.example.com` |
| `SSO_MOCKER_LOGIN_MODE` | `login.mode` | `auto` |
| `SSO_MOCKER_AUTO_LOGIN_USER` | `login.autoLoginUser` | `alice` |
| `SSO_MOCKER_STORAGE_ADAPTER` | `storage.adapter` | `redis` |
| `REDIS_URL` | `storage.redis.url` | `redis://localhost:6379` |
| `SIGNING_KEYS_JSON` | `signing.keys` | `[{"kty":"RSA",...}]` |

### Validation

All config is validated at startup via Zod schemas. Invalid config = immediate error with a clear message.

`${ENV_VAR}` references are resolved at load time. Missing required vars fail fast at startup.

---

## 3. OIDC Flows & Login UI

### Supported Flows

**Authorization Code Flow** (browser-based apps):

1. Browser visits `/authorize` with `client_id`, `response_type=code`, `redirect_uri`, `scope=openid`
2. SSO Mocker shows login UI (form mode) or auto-authenticates (auto mode)
3. User selects identity (form mode) or is auto-assigned (auto mode)
4. SSO Mocker redirects back to `redirect_uri` with authorization `code`
5. App exchanges `code` for `id_token` + `access_token` at `/token`

**Authorization Code + PKCE** (SPAs / mobile):

Same as above, but client sends `code_challenge` + `code_challenge_method=S256` on `/authorize`, and `code_verifier` on `/token`. No client secret needed. `oidc-provider` handles all PKCE validation.

**Client Credentials** (machine-to-machine):

1. Service sends `POST /token` with `grant_type=client_credentials`, `client_id`, `client_secret`, `scope`
2. SSO Mocker returns `access_token` with the client's allowed scopes
3. No user involved, no interaction endpoint

### Login UI

Two modes, controlled by `login.mode` in config:

**`mode: "auto"` (CI/testing):**

The `/authorize` endpoint immediately authenticates as `login.autoLoginUser` and redirects back with a code. Zero human interaction. Playwright tests in CI never see a login page.

**`mode: "form"` (local dev / staging):**

A server-rendered HTML page showing all configured users as a selectable list:

- Each user row shows name, role, and team memberships
- No password field (this is a mock)
- Shows requesting client ID and scopes at the bottom for debugging
- Sign-in button submits a POST to complete the interaction

**Playwright-friendly attributes:**

- Each user row: `data-testid="user-{id}"`
- Sign-in button: `data-testid="sign-in"`

### Playwright Usage Patterns

**Auto-login in CI (mode: auto):**

Tests don't interact with the login UI at all. The OIDC flow completes transparently.

**Form interaction for local SPA testing (mode: form):**

```typescript
await page.goto('http://localhost:3000');
await page.waitForURL('**/interaction/**');
await page.click('[data-testid="user-alice"]');
await page.click('[data-testid="sign-in"]');
await expect(page.locator('.username')).toHaveText('Alice Admin');
```

**Switching auto-login user via Admin API:**

```typescript
await fetch('http://localhost:9090/admin/v1/config/login', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ autoLoginUser: 'carol' })
});
```

### Token Configuration

```yaml
tokens:
  idToken:
    ttl: 3600           # seconds
  accessToken:
    ttl: 3600
    format: "jwt"       # "jwt" | "opaque"
  refreshToken:
    ttl: 86400
    enabled: true
```

### OIDC Discovery

`oidc-provider` automatically serves `/.well-known/openid-configuration` based on the configured issuer.

---

## 4. Admin API

REST API for managing users, roles, teams, and clients at runtime without restarting the server.

### Base Path

```
/admin/v1/...
```

### Endpoints

**Users:**

```
GET    /admin/v1/users              # List all users
GET    /admin/v1/users/:id          # Get user by ID
POST   /admin/v1/users              # Create user
PATCH  /admin/v1/users/:id          # Update user (partial)
DELETE /admin/v1/users/:id          # Delete user
```

Create user request:

```json
POST /admin/v1/users
{
  "id": "dave",
  "email": "dave@example.com",
  "name": "Dave Developer",
  "role": "editor",
  "teams": ["engineering"]
}
```

Response includes computed `effectiveScopes`:

```json
201 Created
{
  "id": "dave",
  "email": "dave@example.com",
  "name": "Dave Developer",
  "role": "editor",
  "teams": ["engineering"],
  "effectiveScopes": ["read:*", "write:*", "read:repos", "write:repos", "read:ci"]
}
```

**Roles:**

```
GET    /admin/v1/roles              # List all roles
GET    /admin/v1/roles/:id          # Get role by ID
POST   /admin/v1/roles              # Create role
PATCH  /admin/v1/roles/:id          # Update role
DELETE /admin/v1/roles/:id          # Delete role (fails if users assigned)
```

**Teams:**

```
GET    /admin/v1/teams              # List all teams
GET    /admin/v1/teams/:id          # Get team by ID
POST   /admin/v1/teams              # Create team
PATCH  /admin/v1/teams/:id          # Update team
DELETE /admin/v1/teams/:id          # Delete team (fails if users assigned)
GET    /admin/v1/teams/:id/members  # List team members
```

**Clients:**

```
GET    /admin/v1/clients            # List all OIDC clients
GET    /admin/v1/clients/:id        # Get client by ID
POST   /admin/v1/clients            # Register a new OIDC client
PATCH  /admin/v1/clients/:id        # Update client
DELETE /admin/v1/clients/:id        # Remove client
```

**State Management:**

```
POST   /admin/v1/reset              # Reset ALL state to config baseline
POST   /admin/v1/reset/users        # Reset only users
POST   /admin/v1/reset/roles        # Reset only roles
POST   /admin/v1/reset/teams        # Reset only teams
POST   /admin/v1/reset/clients      # Reset only clients
```

**Runtime Configuration:**

```
PATCH  /admin/v1/config/login       # Change login mode / autoLoginUser
```

### Validation Rules

- Create user: `id` and `email` must be unique; `role` must reference existing role; `teams` must all reference existing teams
- Delete role/team: fails with `409 Conflict` if any users are currently assigned
- Patch: partial updates, only provided fields are changed
- All mutations: validated with Zod schemas

### Error Response Format

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

### Authentication

By default unauthenticated (it's a mock). Optional bearer token auth:

```yaml
admin:
  enabled: true
  apiKey: "${ADMIN_API_KEY}"     # If set, requires Authorization: Bearer <key>
```

If `admin.enabled: false`, all `/admin/v1/*` routes return `404`.

---

## 5. CI/CD & GitHub Actions Integration

### 5A: SSO Mocker's Own CI Pipeline

```
.github/workflows/
  ci.yml                # Test + lint on every PR
  release.yml           # Build + publish on version tags
  fixtures-guard.yml    # Prevent user fixtures in production configs
  pages-deploy.yml      # Deploy discovery doc to org GitHub Pages
```

**ci.yml:** Runs lint, typecheck, unit tests, integration tests, and Playwright E2E on every PR and push to main.

**release.yml:** Triggered by version tags (`v*.*.*`). Publishes npm package with `--provenance` to GitHub Packages and Docker image to GHCR.

**fixtures-guard.yml:** Required status check on PRs that modify `config/**` or `fixtures/**`. Runs `scripts/check-no-production-fixtures.js` which fails if:
- `config/production.yaml` contains a non-empty `users:` array
- `fixtures/production.users.yaml` exists

**pages-deploy.yml:** Deploys the static OIDC discovery document to the org-level GitHub Pages.

### 5B: Consuming Apps - Docker Service Container

```yaml
jobs:
  integration:
    runs-on: ubuntu-latest
    services:
      sso-mocker:
        image: ghcr.io/myorg/sso-mocker:latest
        env:
          SSO_MOCKER_ENV: integration
        ports:
          - 9090:9090
        options: >-
          --health-cmd "curl -f http://localhost:9090/.well-known/openid-configuration || exit 1"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
        env:
          OIDC_ISSUER: http://localhost:9090
```

### 5C: Consuming Apps - npx Background Process

```yaml
steps:
  - name: Start SSO Mocker
    run: |
      npx @myorg/sso-mocker start --env integration &
      timeout 30 bash -c 'until curl -sf http://localhost:9090/.well-known/openid-configuration; do sleep 1; done'
  - run: npm test
    env:
      OIDC_ISSUER: http://localhost:9090
```

### 5D: Playwright SPA Testing in CI

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      sso-mocker:
        image: ghcr.io/myorg/sso-mocker:latest
        env:
          SSO_MOCKER_ENV: integration
          SSO_MOCKER_LOGIN_MODE: auto
          SSO_MOCKER_AUTO_LOGIN_USER: alice
        ports:
          - 9090:9090
        options: >-
          --health-cmd "curl -f http://localhost:9090/.well-known/openid-configuration || exit 1"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Start SPA dev server
        run: npm run dev &
      - run: npx playwright test
        env:
          OIDC_ISSUER: http://localhost:9090
          BASE_URL: http://localhost:3000
```

### 5E: Reusable Workflow

For orgs with many repos consuming SSO Mocker, a reusable workflow in a shared `.github` repo:

```yaml
name: SSO Mocker Setup
on:
  workflow_call:
    inputs:
      environment:
        type: string
        default: 'integration'
      login-mode:
        type: string
        default: 'auto'
      auto-login-user:
        type: string
        default: 'alice'
      mocker-version:
        type: string
        default: 'latest'
```

---

## 6. Packaging & Deployment

### Package Formats

| Format | Registry | Use Case |
|---|---|---|
| npm package (`@myorg/sso-mocker`) | GitHub Packages npm | Local dev, npx, programmatic import |
| Docker image | GHCR (`ghcr.io/myorg/sso-mocker`) | CI service containers, EKS, staging/demo |

### CLI Interface

```bash
npx @myorg/sso-mocker start                    # Development defaults
npx @myorg/sso-mocker start --env integration   # Specify environment
npx @myorg/sso-mocker start --port 8080         # Override port
npx @myorg/sso-mocker start --login-mode auto   # Override login mode
npx @myorg/sso-mocker start --config ./configs/ # Custom config dir
npx @myorg/sso-mocker config --env staging      # Print resolved config
```

### Programmatic API

```typescript
import { createMocker } from '@myorg/sso-mocker';

const mocker = await createMocker({
  env: 'integration',
  port: 0,                    // Random available port
  loginMode: 'auto',
  autoLoginUser: 'alice'
});

await mocker.start();
console.log(mocker.issuer);   // http://localhost:{random}
await mocker.stop();
```

### Docker Image

Multi-stage build on `node:22-alpine`. Runs as non-root user (`mocker:1001`). Built-in healthcheck via `wget` to `/health`. Default entrypoint starts the server with `--env integration`.

```bash
docker run ghcr.io/myorg/sso-mocker:latest                              # Default
docker run -e SSO_MOCKER_ENV=staging ghcr.io/myorg/sso-mocker:latest    # Override env
docker run -v ./configs:/app/config ghcr.io/myorg/sso-mocker:latest     # Custom config
```

### Deployment Targets

| Environment | Package | Storage | How it runs |
|---|---|---|---|
| Local dev | npm (npx) | In-memory | Background process or Docker Compose |
| CI / GitHub Actions | Docker or npx | In-memory | Service container or background proc |
| Staging | Docker (GHCR) | Redis | EKS Deployment + Service + Ingress |
| Demo | Docker (GHCR) | Redis or memory | EKS (separate namespace) |
| Production (future) | Docker (GHCR) | Redis | EKS, no fixtures, Admin API only |

### EKS Deployment

Kubernetes manifests use Kustomize:

```
k8s/
  base/
    kustomization.yaml
    deployment.yaml
    service.yaml
    configmap.yaml
  overlays/
    staging/
      kustomization.yaml
      ingress.yaml
      redis.yaml
    demo/
      kustomization.yaml
      ingress.yaml
```

Key deployment properties:
- 2 replicas for staging (HA without overkill)
- Redis adapter for cross-replica state
- Signing keys from K8s Secrets
- Readiness probe: `GET /health`
- Liveness probe: `GET /health`
- Resource limits: 128-256Mi memory, 100-500m CPU

### Docker Compose (Local Dev)

```yaml
services:
  sso-mocker:
    image: ghcr.io/myorg/sso-mocker:latest
    ports: ["9090:9090"]
    environment:
      SSO_MOCKER_ENV: development
      SSO_MOCKER_LOGIN_MODE: form
    volumes:
      - ./config:/app/config
      - ./fixtures:/app/fixtures
```

### GitHub Pages OIDC Discovery

For staging/demo/production where the OIDC issuer URL should be the org's GitHub Pages domain:

- Deploy a static `.well-known/openid-configuration` JSON to the org-level GitHub Pages (`myorg.github.io`)
- Include `.nojekyll` file to prevent Jekyll from ignoring dotfile directories
- The discovery document's `issuer` matches the GitHub Pages URL
- The discovery document's endpoint URLs (`authorization_endpoint`, `token_endpoint`, etc.) point to the actual OIDC server (EKS)
- The OIDC server is configured with the GitHub Pages URL as its `issuer` so token `iss` claims match
- The discovery document is auto-generated and deployed via `pages-deploy.yml` workflow to stay in sync

---

## 7. Testing Strategy

### Test Pyramid

| Layer | Runner | Approx Count | Speed |
|---|---|---|---|
| Unit | Vitest | 60-80 | <5s |
| Integration | Vitest + supertest | 30-50 | <15s |
| E2E | Playwright | 10-15 | <30s |
| **Total** | | **100-145** | **<50s** |

### Unit Tests

Pure logic, no HTTP server:

- **Config loader:** merging, env var interpolation, production fixture rejection, schema validation
- **Claim builder:** role inclusion, team memberships, effective scope computation, wildcard expansion, deduplication
- **Scope resolver:** exact match, wildcard expansion, role+team union
- **In-memory store:** upsert/find/destroy/consume, TTL expiration
- **Fixtures guard:** production.yaml user rejection, fixtures/production.users.yaml existence check

### Integration Tests

HTTP-level tests against a running mocker (random port, programmatic API):

- **OIDC Discovery:** serves correct `.well-known`, issuer matches, endpoints reachable
- **Authorization Code Flow:** redirect to interaction, code return, token exchange, correct claims, reject invalid redirect_uri/client_id
- **Authorization Code + PKCE:** code_challenge accepted, code_verifier validated, rejects missing/incorrect verifier, works without client_secret
- **Client Credentials:** issues access_token with client scopes, rejects bad credentials, no user claims
- **Userinfo:** returns claims for valid token, 401 for expired/invalid
- **Admin API:** full CRUD, validation (duplicate id, nonexistent role, 409 on delete with assignments), reset to baseline, API key auth, disabled mode returns 404, PATCH /config/login
- **Login modes:** auto skips interaction, form returns HTML with users
- **Redis adapter:** same interface tests as memory, across two instances sharing Redis (runs only when REDIS_URL available)

### E2E Tests (Playwright)

Full browser-based tests against a sample SPA (`test/e2e/sample-app/`):

- Login UI displays all users with roles/teams
- Login UI shows requesting client and scopes
- Authentication redirects back with tokens
- All interactive elements have `data-testid` attributes
- Full OIDC roundtrip through a browser
- User switching produces different claims
- Auto-login mode completes without interaction

### CI Test Matrix

```
unit              -> ubuntu-latest, no services
integration       -> ubuntu-latest, no services (memory adapter)
integration-redis -> ubuntu-latest, redis:7-alpine service (redis adapter)
e2e               -> ubuntu-latest, playwright chromium
docker-smoke      -> build image, start, healthcheck, verify discovery
```

### What We Don't Test

| Excluded | Reason |
|---|---|
| `oidc-provider` internals | Certified, tested upstream |
| Redis itself | Trusted infrastructure |
| Playwright browser engine | Tool, not subject |
| Performance/load | Out of scope for a mock |

---

## 8. Technology Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 22 | Fast startup, native on GH runners |
| Language | TypeScript | Type safety, better DX |
| OIDC Core | `oidc-provider` v9 (MIT) | Certified OIDC, handles protocol complexity |
| HTTP Framework | Koa (via oidc-provider) | `oidc-provider` is Koa-based |
| Config Validation | Zod | Runtime schema validation |
| Config Files | YAML | Human-readable, env var interpolation |
| JWT | `jose` (via oidc-provider) | Already a dependency |
| Testing | Vitest + supertest | Fast, modern, TypeScript-native |
| E2E Testing | Playwright | Headless browser testing |
| Linting | ESLint + Prettier | Standard tooling |
| Docker Base | node:22-alpine | Small image (~50MB) |
| CI | GitHub Actions | Native to target platform |
| npm Registry | GitHub Packages | All-GitHub ecosystem |
| Docker Registry | GHCR | All-GitHub ecosystem |
| K8s Manifests | Kustomize | Base + overlays per environment |

---

## 9. Project Structure

```
sso-mocker/
  bin/
    sso-mocker.js                  # CLI entry point
  src/
    server.ts                      # Main server setup
    config/
      loader.ts                    # Config file loading + merging
      schema.ts                    # Zod schemas
      interpolate.ts               # ${ENV_VAR} resolution
    oidc/
      provider.ts                  # oidc-provider configuration
      claims.ts                    # Claim builder (user -> token claims)
      scopes.ts                    # Scope resolver (wildcards, unions)
      interactions.ts              # Login interaction handler
    admin/
      router.ts                    # Admin API routes
      handlers/
        users.ts
        roles.ts
        teams.ts
        clients.ts
        reset.ts
        config.ts                  # Runtime config changes
      validation.ts                # Request validation schemas
    store/
      adapter.ts                   # Adapter interface
      memory.ts                    # In-memory implementation
      redis.ts                     # Redis implementation
    ui/
      login.ts                     # Login page renderer
      templates/
        login.html                 # Login form template
    health.ts                      # Health check endpoint
  config/
    default.yaml
    development.yaml
    integration.yaml
    staging.yaml
    production.yaml
  fixtures/
    development.users.yaml
    integration.users.yaml
  k8s/
    base/
      kustomization.yaml
      deployment.yaml
      service.yaml
      configmap.yaml
    overlays/
      staging/
        kustomization.yaml
        ingress.yaml
      demo/
        kustomization.yaml
        ingress.yaml
  scripts/
    check-no-production-fixtures.js
  test/
    unit/
      config.test.ts
      claims.test.ts
      scopes.test.ts
      store-memory.test.ts
      fixtures-guard.test.ts
    integration/
      discovery.test.ts
      auth-code.test.ts
      auth-code-pkce.test.ts
      client-credentials.test.ts
      userinfo.test.ts
      admin-api.test.ts
      login-modes.test.ts
      store-redis.test.ts
    e2e/
      sample-app/                  # Minimal SPA for E2E testing
      login-ui.spec.ts
      oidc-roundtrip.spec.ts
      auto-login.spec.ts
    helpers/
      mocker.ts                    # Shared test fixture (startTestMocker)
      oidc-client.ts               # Test OIDC client helper
  .github/
    workflows/
      ci.yml
      release.yml
      fixtures-guard.yml
      pages-deploy.yml
  Dockerfile
  docker-compose.yml
  docker-compose.staging.yml
  package.json
  tsconfig.json
  vitest.config.ts
  playwright.config.ts
```

---

## 10. Open TODOs

- [ ] **CI gate: prevent PR merge if production fixtures contain users** - `scripts/check-no-production-fixtures.js` + required status check on the repo
- [ ] **GitHub Pages org-level `.well-known` discovery** - static discovery doc + `.nojekyll` + Content-Type validation across OIDC client libraries + `pages-deploy.yml` automation
- [ ] **Login form `data-testid` attributes** - stable selectors on all interactive elements for Playwright
- [ ] **Admin API rate limiting** - optional rate limiting for staging/demo when network-exposed
- [ ] **`PATCH /admin/v1/config/login`** - runtime login mode / autoLoginUser changes
- [ ] **`GET /health` endpoint** - readiness/liveness probes for Docker and K8s
- [ ] **Reusable GitHub Actions workflow** - org-wide consumption for consuming repos
- [ ] **npm provenance** - publish with `--provenance` flag for supply chain verification
- [ ] **Graceful shutdown** - handle SIGTERM for clean K8s pod termination (drain connections, close Redis)
- [ ] **Config hot-reload** - file-watching in dev mode (optional, dev-only convenience)
- [ ] **Sample SPA in `test/e2e/sample-app/`** - minimal HTML page for E2E tests
- [ ] **`openid-client` as dev dependency** - for integration test OIDC client helper

---

## 11. Licensing

### SSO Mocker

To be determined (recommend MIT for maximum consumability).

### Key Dependency: oidc-provider

- **License:** MIT (since 2015)
- **Copyright:** Filip Skokan
- **All runtime dependencies:** MIT licensed
- **No install scripts** (no supply chain exfiltration vector)
- **Published via GitHub Actions OIDC** (not personal npm tokens)
- **OpenID Foundation certified** for multiple profiles
- **Single maintainer risk:** mitigated by MIT license (forkable) and stable maintenance history (10+ years)

Full supply chain assessment was conducted and is available in the project conversation history.
