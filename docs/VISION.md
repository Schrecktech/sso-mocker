# SSO Mocker Vision

## What

SSO Mocker is a configurable OIDC identity provider for development, testing, and non-production environments. It lets your apps authenticate and authorize users without connecting to a real identity provider.

## Why

Real SSO providers (Okta, Azure AD, Auth0) create friction in development and testing:

- **Local development** requires VPN, network access, or sandbox tenant configuration
- **CI pipelines** need stable, fast identity infrastructure that doesn't rate-limit or go down
- **Demo environments** need predictable user personas that stakeholders can switch between
- **Integration tests** need deterministic identity state that can be set up and torn down per test

SSO Mocker eliminates this friction by providing a lightweight, standards-compliant OIDC provider you control entirely.

## How

Built on `oidc-provider` (OpenID Certified), SSO Mocker adds:

- **Environment-specific configuration** — YAML config files define teams, roles, scopes, and clients. User fixtures are layered per environment (dev/integration/staging) with a hard gate preventing test users from reaching production.
- **Admin API** — REST endpoints to create, modify, and reset users, roles, teams, and clients at runtime. Tests set up exactly the identity state they need without restarting the server.
- **Flexible login modes** — auto-login for CI (zero interaction, instant authentication) or a form-based user picker for local dev and Playwright-based SPA testing.
- **Multiple deployment targets** — runs as an npm package (`npx`), Docker container, GitHub Actions service container, or EKS deployment. Published to GitHub Packages (npm) and GHCR (Docker).

## Principles

- **Standards-compliant** — uses a certified OIDC implementation so real OIDC client libraries work without modification
- **Deterministic by default** — in-memory storage and config-driven fixtures mean every restart produces identical state
- **Structurally safe** — test fixtures cannot reach production through misconfiguration; the server refuses to start with fixtures in production mode
- **All-GitHub ecosystem** — npm on GitHub Packages, Docker on GHCR, CI on GitHub Actions, discovery on GitHub Pages
- **One artifact, any environment** — the same Docker image runs locally, in CI, and on EKS; behavior is controlled by configuration and environment variables

## Scope

### In Scope

- OIDC provider: Authorization Code, Authorization Code + PKCE, Client Credentials flows
- RBAC with team-scoped permissions
- Admin API for runtime state management
- Docker + npm packaging
- GitHub Actions integration (service containers, reusable workflows)
- EKS deployment manifests (Kustomize)
- Playwright-friendly login UI

### Out of Scope

- SAML support
- Replacing a production IdP
- User self-registration or password management
- Performance or load testing
- Multi-tenancy
