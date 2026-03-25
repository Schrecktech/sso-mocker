# SSO Mocker

A configurable OIDC identity provider for development, testing, and non-production environments. Authenticate and authorize your apps without a real IdP.

Built on [oidc-provider](https://github.com/panva/node-oidc-provider) (OpenID Certified).

## Features

- **Full OIDC compliance** — Authorization Code, Authorization Code + PKCE, Client Credentials flows
- **RBAC with team scopes** — roles carry scopes, teams carry scopes, users get the union
- **Environment-specific config** — YAML configs with layered overrides per environment
- **Admin API** — create, update, delete users/roles/teams/clients at runtime; reset to baseline between tests
- **Two login modes** — auto-login for CI (zero interaction) or form picker for dev/Playwright testing
- **Production safety** — server refuses to start with user fixtures in production mode
- **Multiple deployment targets** — npm, Docker, GitHub Actions service container, EKS

## Replacing Your IdP in CI/CD

If your app authenticates with Okta, Auth0, Azure AD, AWS Cognito, or any OIDC-compliant provider in production, SSO Mocker lets you run integration tests without connecting to that provider. The pattern:

**Production:** Your app talks to your real IdP.
**CI/CD:** Your app talks to SSO Mocker instead — same OIDC protocol, deterministic users, no external dependencies.

The only change needed in your app is making the OIDC issuer URL configurable:

```typescript
// In your app's auth config
const issuerUrl = process.env.OIDC_ISSUER || 'https://your-org.okta.com';
```

Then in your GitHub Actions workflow, set `OIDC_ISSUER` to SSO Mocker:

```yaml
steps:
  - uses: Schrecktech/sso-mocker@main
    id: sso
  - run: npm test
    env:
      OIDC_ISSUER: ${{ steps.sso.outputs.issuer }}
```

Your app's OIDC client library (e.g., `openid-client`, `next-auth`, `passport-openidconnect`, `oidc-client-ts`, `@auth0/nextjs-auth0`) discovers all endpoints automatically from `/.well-known/openid-configuration` — no code changes needed beyond the issuer URL.

### What works out of the box

| Production IdP | What SSO Mocker replaces | Notes |
|---|---|---|
| Okta | Authorization server + user directory | Map Okta groups to SSO Mocker teams |
| Auth0 | Tenant + user management | Map Auth0 roles/permissions to SSO Mocker roles/scopes |
| Azure AD / Entra ID | App registration + directory | Map AD groups to teams, app roles to roles |
| AWS Cognito | User pool + app client | Map Cognito groups to teams |
| Keycloak | Realm + client | Direct mapping — Keycloak's model is similar |
| Any OIDC provider | OIDC endpoints + user store | If your app uses standard OIDC, it works |

### Integration checklist

1. Make your app's OIDC issuer URL configurable via environment variable
2. Register your app's redirect URI in SSO Mocker's `config/default.yaml` (or use the Admin API)
3. Map your production roles/groups to SSO Mocker roles and teams
4. Add the SSO Mocker GitHub Action or service container to your CI workflow
5. Set `OIDC_ISSUER` to the mocker's URL in your test environment

For detailed integration patterns, see the [Developer's Guide](docs/DEVELOPERS_GUIDE.md).

## Quick Start

### Local Development (npx)

```bash
npx @schrecktech/sso-mocker start
```

Starts the mocker on `http://localhost:9090` with the development config and login form.

Point your app's OIDC client at:
```
http://localhost:9090/.well-known/openid-configuration
```

### Docker

```bash
docker run -p 9090:9090 ghcr.io/schrecktech/sso-mocker:latest
```

### GitHub Actions (Service Container)

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
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
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
        env:
          OIDC_ISSUER: http://localhost:9090
```

### GitHub Actions (Action)

```yaml
steps:
  - uses: Schrecktech/sso-mocker@v0.5.0
    id: sso
    with:
      login-mode: auto
      auto-login-user: alice
  - run: npm test
    env:
      OIDC_ISSUER: ${{ steps.sso.outputs.issuer }}
```

| Input | Default | Description |
|---|---|---|
| `environment` | `integration` | Config environment |
| `port` | `9090` | HTTP port |
| `login-mode` | `auto` | `auto` (CI) or `form` (user picker) |
| `auto-login-user` | `alice` | User ID for auto-login mode |
| `config` | | Path to custom config directory (overrides defaults) |
| `node-version` | `22` | Node.js version |

**Output:** `issuer` — the OIDC issuer URL (e.g., `http://localhost:9090`)

### Programmatic (Test Suites)

```typescript
import { createMocker } from '@schrecktech/sso-mocker';

const mocker = await createMocker({
  env: 'integration',
  port: 0,                    // Random available port
  loginMode: 'auto',
  autoLoginUser: 'alice'
});

await mocker.start();
// ... run your tests against mocker.issuer ...
await mocker.stop();
```

## Configuration

Configuration uses YAML files with environment-specific layering:

```
config/
  default.yaml              # Shared structure (teams, roles, scopes, clients)
  development.yaml          # Local dev overrides
  development.users.yaml    # Dev user personas
  integration.yaml          # CI overrides
  integration.users.yaml    # CI user personas
  staging.yaml              # Staging overrides
  production.yaml           # Production overrides (no user fixtures allowed)
```

Select environment via `SSO_MOCKER_ENV` (defaults to `development`).

See [Administrator's Guide](docs/ADMINISTRATORS_GUIDE.md) for full configuration reference.

## Admin API

Manage identity state at runtime:

```bash
# Create a user
curl -X POST http://localhost:9090/admin/v1/users \
  -H 'Content-Type: application/json' \
  -d '{"id":"dave","email":"dave@example.com","name":"Dave","role":"editor","teams":["engineering"]}'

# Reset all state to config baseline
curl -X POST http://localhost:9090/admin/v1/reset

# Bulk replace roles, teams, users, and/or clients
curl -X POST http://localhost:9090/admin/v1/import \
  -H 'Content-Type: application/json' \
  -d '{"roles":[...],"teams":[...],"users":[...],"clients":[...]}'
```

Full API reference in the [Developer's Guide](docs/DEVELOPERS_GUIDE.md).

## Documentation

| Document | Audience | Description |
|---|---|---|
| [Vision](docs/VISION.md) | Everyone | Project goals, principles, and scope |
| [GitHub Setup Guide](docs/GITHUB_SETUP.md) | DevOps / platform | Step-by-step repo, packages, Pages, and CI setup |
| [Developer's Guide](docs/DEVELOPERS_GUIDE.md) | App developers | How to integrate SSO Mocker into your app and tests |
| [Administrator's Guide](docs/ADMINISTRATORS_GUIDE.md) | DevOps / platform | Deployment, configuration, and operations |
| [Design Spec](docs/superpowers/specs/2026-03-24-sso-mocker-design.md) | Contributors | Full technical design |

## Supported OIDC Flows

| Flow | Use Case | Client Type |
|---|---|---|
| Authorization Code | Browser-based apps | Confidential |
| Authorization Code + PKCE | SPAs, mobile apps | Public |
| Client Credentials | Machine-to-machine | Confidential |

## License

[MIT-0](LICENSE) (MIT No Attribution)
