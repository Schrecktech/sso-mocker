# AGENTS.md

## Project
Configurable OIDC identity provider built on `oidc-provider` v9 (MIT, panva). Node.js 22, TypeScript ESM, Koa, Zod v4, Vitest.

## Commands
- `npm run build` — compile TS + copy HTML templates to dist/
- `npm test` — run all tests (unit + integration)
- `npm run test:unit` — unit tests only
- `npm run test:integration` — integration tests only
- `npm run typecheck` — tsc --noEmit
- `node bin/sso-mocker.js start --env development` — run locally after build

## Git Workflow
- Branch protection on `main`: PRs required, merge queue, 2 required status checks
- Never push directly to main — always use feature branches + PRs
- Commits signed with SSH key (`gpg.format=ssh`, `commit.gpgsign=true`)
- Co-Authored-By: `Claude <noreply@anthropic.com>` (no model version)
- GitHub Actions pinned to SHA with version comment: `@sha # vX.Y.Z`

## Architecture
- `oidc-provider` v9 extends Koa — mount middleware with `provider.use()`, NOT a separate Koa app
- `src/server.ts` creates the provider, mounts routes via `provider.use()`, starts via `provider.listen()`
- Config: `config/` has `default.yaml`, `{env}.yaml`, `{env}.users.yaml` (unified directory)
- Storage adapter pattern: `src/store/memory.ts` (dev/CI), Redis adapter pending

## Critical Gotchas
- MemoryAdapter MUST implement `findByUid`, `findByUserCode`, `revokeByGrantId` — v9 requires them
- Set `conformIdTokenClaims: false` — otherwise only `sub` appears in ID tokens
- `jose.generateKeyPair('RS256', { extractable: true })` — non-extractable keys fail silently
- `ctx.request.body` needs `(ctx.request as any).body` cast — body set by custom middleware
- Zod v4: use `.default({ port: 9090, issuer: '...' })` not `.default({}).pipe(Schema)`
- GHCR tags must be lowercase — use `${IMAGE_NAME,,}` in workflows
- Integration fixtures (alice, test-admin, test-viewer) differ from dev fixtures (alice, bob, carol)
- Action must `cd "$GITHUB_ACTION_PATH"` before starting — config resolves from cwd

## Testing
- Unit tests: `test/unit/` — pure logic, no HTTP
- Integration tests: `test/integration/` — uses `test/helpers/mocker.ts` to start on random port
- E2E tests: separate repo `Schrecktech/sso-mocker-tester` with Playwright (3s timeout)
- Playwright: use `browser.newContext()` between OIDC tests — session cookies persist after `MemoryAdapter.flushAll()`

## Release Process
1. Feature branch -> PR -> merge queue -> main
2. Create `release/vX.Y.Z` branch, bump version in package.json
3. PR -> merge -> tag `vX.Y.Z` -> push tag
4. `release.yml` auto-publishes to npm (GitHub Packages) + GHCR
