# Administrator's Guide

Deployment, configuration, and operations for SSO Mocker.

> **First time setting up?** Start with the [GitHub Setup Guide](GITHUB_SETUP.md) for step-by-step instructions on creating the repo, configuring packages, branch protection, GitHub Pages, and your first release.

## Deployment Targets

| Environment | Package | Storage | Recommended Setup |
|---|---|---|---|
| Local dev | npm (npx) | In-memory | `npx @schrecktech/sso-mocker start` |
| CI / GitHub Actions | Docker or npx | In-memory | Service container or background process |
| Staging | Docker (GHCR) | Redis | EKS Deployment (2 replicas) |
| Demo | Docker (GHCR) | Redis or memory | EKS (separate namespace) |
| Production | Docker (GHCR) | Redis | EKS, no fixtures, Admin API only |

## Configuration Reference

### Config File Layering

```
config/
  default.yaml              # Base structure (loaded always)
  development.yaml          # Merged when SSO_MOCKER_ENV=development
  development.users.yaml    # User personas for development
  integration.yaml          # Merged when SSO_MOCKER_ENV=integration
  integration.users.yaml    # User personas for CI
  staging.yaml              # Merged when SSO_MOCKER_ENV=staging
  staging.users.yaml        # Optional sparse personas for staging
  production.yaml           # Merged when SSO_MOCKER_ENV=production
```

All config and fixture files live in a single `config/` directory.

Environment is selected via `SSO_MOCKER_ENV` (defaults to `development`).

### Config Precedence (last wins)

1. `config/default.yaml` — base structure
2. `config/{SSO_MOCKER_ENV}.yaml` — environment overrides
3. `config/{SSO_MOCKER_ENV}.users.yaml` — user fixtures (if allowed)
4. Environment variables (`SSO_MOCKER_*`) — runtime overrides
5. CLI flags (`--port`, `--login-mode`, etc.) — highest priority

### Full Config Schema

```yaml
server:
  port: 9090                        # HTTP port
  issuer: "http://localhost:9090"   # OIDC issuer URL (must match discovery)

storage:
  adapter: "memory"                 # "memory" | "redis"
  redis:
    url: "redis://localhost:6379"   # Redis connection URL

login:
  mode: "form"                      # "auto" | "form"
  autoLoginUser: "alice"            # User ID for auto-login mode

signing:
  keys: []                          # JWK set (JSON); empty = auto-generate

tokens:
  idToken:
    ttl: 3600                       # Seconds
  accessToken:
    ttl: 3600
    format: "jwt"                   # "jwt" | "opaque"
  refreshToken:
    ttl: 86400
    enabled: true

clients:                            # OIDC client registrations
  - clientId: "my-spa"
    clientSecret: null              # null = public client (PKCE)
    redirectUris:
      - "http://localhost:3000/callback"
    grantTypes:
      - "authorization_code"
    tokenEndpointAuthMethod: "none"
    scopes: []                      # Empty = all scopes allowed

teams:                              # Team definitions with scopes
  - id: "engineering"
    name: "Engineering"
    scopes: ["read:repos", "write:repos", "read:ci"]

roles:                              # Role definitions with scopes
  - id: "admin"
    name: "Administrator"
    scopes: ["*"]                   # Wildcard = all scopes

cors:
  allowedOrigins: []                # Empty = allow all origins; set for staging/prod

logging:
  level: "info"                     # "debug" | "info" | "warn" | "error"

admin:
  enabled: true                     # false = Admin API returns 404
  apiKey: null                      # null = no auth (REJECTED in production mode)
```

### Environment Variable Mapping

| Env Var | Config Path | Example |
|---|---|---|
| `SSO_MOCKER_ENV` | Selects config file | `integration` |
| `SSO_MOCKER_PORT` | `server.port` | `8080` |
| `SSO_MOCKER_ISSUER` | `server.issuer` | `https://sso.example.com` |
| `SSO_MOCKER_LOGIN_MODE` | `login.mode` | `auto` |
| `SSO_MOCKER_AUTO_LOGIN_USER` | `login.autoLoginUser` | `alice` |
| `SSO_MOCKER_STORAGE_ADAPTER` | `storage.adapter` | `redis` |
| `REDIS_URL` | `storage.redis.url` | `redis://localhost:6379` |
| `SIGNING_KEYS_JSON` | `signing.keys` | `[{"kty":"RSA",...}]` |
| `ADMIN_API_KEY` | `admin.apiKey` | `my-secret-key` |

### Environment Variable Interpolation in YAML

Config files support `${ENV_VAR}` syntax:

```yaml
storage:
  redis:
    url: "${REDIS_URL}"
signing:
  keys: "${SIGNING_KEYS_JSON}"
```

Missing required env vars cause a startup failure with a clear error message.

## CLI Reference

```bash
# Start server
npx @schrecktech/sso-mocker start [options]

Options:
  --env <environment>       Environment name (default: development)
  --port <number>           HTTP port (default: 9090)
  --login-mode <mode>       "auto" or "form" (default: from config)
  --config <path>           Custom config directory

# Print resolved config
npx @schrecktech/sso-mocker config --env <environment>
```

## Docker

### Running

```bash
# Default (integration environment)
docker run -p 9090:9090 ghcr.io/schrecktech/sso-mocker:latest

# Override environment
docker run -p 9090:9090 -e SSO_MOCKER_ENV=staging ghcr.io/schrecktech/sso-mocker:latest

# Mount custom config
docker run -p 9090:9090 -v ./my-config:/app/config ghcr.io/schrecktech/sso-mocker:latest

# With Redis
docker run -p 9090:9090 \
  -e SSO_MOCKER_ENV=staging \
  -e REDIS_URL=redis://redis-host:6379 \
  -e SIGNING_KEYS_JSON='[{"kty":"RSA",...}]' \
  ghcr.io/schrecktech/sso-mocker:latest
```

### Image Details

- Base: `node:22-alpine`
- Runs as: non-root user `mocker:1001`
- Exposes: port 9090
- Healthcheck: `wget -qO- http://localhost:9090/health`
- Entrypoint: `node bin/sso-mocker.js start`
- Default CMD: `--env integration`

### Docker Compose

**Basic (local dev):**

```yaml
services:
  sso-mocker:
    image: ghcr.io/schrecktech/sso-mocker:latest
    ports: ["9090:9090"]
    environment:
      SSO_MOCKER_ENV: development
      SSO_MOCKER_LOGIN_MODE: form
    volumes:
      - ./config:/app/config
```

**With Redis (simulating staging):**

```yaml
services:
  sso-mocker:
    image: ghcr.io/schrecktech/sso-mocker:latest
    deploy:
      replicas: 2
    ports: ["9090:9090"]
    environment:
      SSO_MOCKER_ENV: staging
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

## Kubernetes (EKS) Deployment

### Directory Structure

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

### Deploying

```bash
# Staging
kubectl apply -k k8s/overlays/staging

# Demo
kubectl apply -k k8s/overlays/demo
```

### Key Configuration

**Secrets (create before deploying):**

```bash
kubectl create secret generic sso-mocker-secrets \
  --from-literal=redis-url=redis://redis:6379 \
  --from-literal=signing-keys='[{"kty":"RSA",...}]' \
  --from-literal=admin-api-key=your-secret-key
```

**Resource Limits:**

| Resource | Request | Limit |
|---|---|---|
| Memory | 128Mi | 256Mi |
| CPU | 100m | 500m |

**Replicas:** 2 for staging (HA without overkill for a mock service).

**Probes:**

- Readiness: `GET /health` (initial delay 5s, period 10s)
- Liveness: `GET /health` (initial delay 10s, period 30s)

### Scaling Considerations

When running multiple replicas:

- **Storage adapter must be `redis`** — in-memory won't share state across replicas
- **Signing keys must be explicit** — loaded from K8s Secrets so all replicas sign tokens identically (auto-generated keys would differ per replica)
- **Containers are stateless** — any replica can be killed/restarted without data loss; all state lives in Redis

## Production Environment

"Production deployment" means deploying the mock as shared infrastructure for other teams' non-production environments, not as a real identity provider for end users.

Production mode has special restrictions enforced at startup:

1. **No user fixtures** — the server refuses to start if `config/production.users.yaml` exists or if any config file defines users
2. **Admin API only** — all user/role/team management happens through the Admin API
3. **API key required** — the server refuses to start if `admin.enabled=true` and `admin.apiKey` is null/empty. Error: `Admin API must be secured with an API key in production mode.`
4. **Stable signing keys** — must be provided explicitly via `SIGNING_KEYS_JSON` (auto-generation is not suitable for production)
5. **Auto-login user validation** — if `login.mode=auto`, the `autoLoginUser` must reference an existing user or the server refuses to start

### Generating Signing Keys

Generate a JWK set for production/staging use:

```bash
node -e "
const { generateKeyPair, exportJWK } = require('jose');
(async () => {
  const { privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(privateKey);
  jwk.use = 'sig';
  jwk.alg = 'RS256';
  console.log(JSON.stringify([jwk]));
})();
"
```

Store the output in your secrets manager and inject via `SIGNING_KEYS_JSON`.

## GitHub Pages OIDC Discovery

For environments where the OIDC issuer URL should be the org's GitHub Pages domain:

1. The org-level GitHub Pages (`schrecktech.github.io`) serves a static `.well-known/openid-configuration` JSON
2. This discovery document lists the actual OIDC server endpoints (on EKS)
3. The OIDC server's `issuer` config matches the GitHub Pages URL
4. Tokens contain `iss: "https://schrecktech.github.io"` matching the discovery URL
5. A `.nojekyll` file in the Pages repo prevents Jekyll from ignoring dotfile directories

The `pages-deploy.yml` workflow automates generating and deploying this discovery document.

## Security Considerations

### Admin API Protection

In any network-accessible environment (staging, demo, production), protect the Admin API:

```yaml
admin:
  enabled: true
  apiKey: "${ADMIN_API_KEY}"
```

All `/admin/v1/*` requests require `Authorization: Bearer <api-key>`.

To disable the Admin API entirely:

```yaml
admin:
  enabled: false
```

### Fixture Safety

The production hard gate is enforced at startup. Additionally, a CI workflow (`fixtures-guard.yml`) runs on every PR that modifies `config/**` or `fixtures/**`, preventing user fixtures from being merged into production config files.

### Signing Keys

- **Dev/CI:** Auto-generated on startup (ephemeral, different each boot)
- **Staging/Production:** Explicit keys from secrets manager (stable across restarts and replicas)

Never commit signing keys to config files. Always inject via environment variables or K8s Secrets.

## Health Check

```
GET /health
```

Returns `200 OK` when the server is ready to handle requests. Used by:
- Docker `HEALTHCHECK`
- Kubernetes readiness/liveness probes
- GitHub Actions service container health options

## Graceful Shutdown

The server handles `SIGTERM` for clean shutdown:
1. Stops accepting new connections
2. Drains in-flight requests
3. Closes Redis connection (if applicable)
4. Exits

This ensures clean pod termination in Kubernetes.

## Monitoring

The mocker is a mock service, not a production IdP. Minimal monitoring is recommended:

- **Health endpoint** — use existing infrastructure monitoring to check `/health`
- **Container logs** — the server logs startup config, request errors, and shutdown events to stdout
- **Redis connectivity** — monitor the Redis connection if using the Redis adapter

## Release Process

### 1. Version Bump

Create a release branch and bump the version in `package.json`:

```bash
git checkout main && git pull
git checkout -b release/vX.Y.Z
# Edit package.json version
npm install --package-lock-only
git add package.json package-lock.json
git commit -m "chore: bump version to X.Y.Z"
git push -u origin release/vX.Y.Z
```

Create a PR, wait for CI to pass, and merge through the merge queue.

### 2. Tag and Push

After the version bump PR merges:

```bash
git checkout main && git pull
git tag -s vX.Y.Z -m "vX.Y.Z: <brief description>"
git push origin vX.Y.Z
```

The signed tag triggers the `release.yml` workflow which:
- Publishes `@schrecktech/sso-mocker@X.Y.Z` to **npmjs.com** with provenance
- Publishes `@schrecktech/sso-mocker@X.Y.Z` to **GitHub Packages** (npm) with provenance
- Builds and pushes `ghcr.io/schrecktech/sso-mocker:vX.Y.Z` and `:latest` to GHCR

### 3. Create GitHub Release

After the release workflow completes, create a GitHub Release with auto-generated notes:

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --generate-notes \
  --latest
```

This generates a changelog from PR titles since the last release, marks it as the latest release, and publishes it.

### 4. Verify

```bash
# Check npmjs.com package
npm view @schrecktech/sso-mocker version

# Check GitHub Packages
npm view @schrecktech/sso-mocker version --registry=https://npm.pkg.github.com

# Check Docker image
docker pull ghcr.io/schrecktech/sso-mocker:vX.Y.Z

# Check GitHub release
gh release view vX.Y.Z --repo Schrecktech/sso-mocker
```

### Version Numbering

Follow [semver](https://semver.org/):
- **Patch** (`0.4.1`) — bug fixes, doc updates
- **Minor** (`0.5.0`) — new features, new endpoints, new config options
- **Major** (`1.0.0`) — breaking changes to config format, API, or CLI

## Troubleshooting

### Server won't start

| Error | Cause | Fix |
|---|---|---|
| "User fixtures are not allowed in production" | Fixtures found in production config | Remove users from production config; use Admin API |
| "Missing required environment variable: X" | `${X}` in YAML but X not set | Set the environment variable |
| "Config validation failed" | Invalid YAML or schema mismatch | Run `npx @schrecktech/sso-mocker config --env <env>` to debug |
| "EADDRINUSE" | Port already in use | Change port via `--port` or `SSO_MOCKER_PORT` |

### OIDC client rejects tokens

| Symptom | Cause | Fix |
|---|---|---|
| "issuer mismatch" | Token `iss` doesn't match expected | Ensure `server.issuer` matches what your client expects |
| "invalid signature" | Signing keys changed between issue and verification | Use stable keys (not auto-generated) for multi-session scenarios |
| "token expired" | Default TTL too short | Increase `tokens.idToken.ttl` in config |

### Multi-replica issues

| Symptom | Cause | Fix |
|---|---|---|
| "authorization code not found" | Code issued by replica A, exchanged at replica B | Switch to `storage.adapter: redis` |
| Different tokens from different replicas | Auto-generated signing keys differ | Set explicit `signing.keys` from secrets |
