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
  - uses: Schrecktech/sso-mocker@v0.1.0
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
  integration.yaml          # CI overrides
  staging.yaml              # Staging overrides
  production.yaml           # Production overrides (no user fixtures allowed)
fixtures/
  development.users.yaml    # Dev user personas
  integration.users.yaml    # CI user personas
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

TBD (recommended: MIT)
