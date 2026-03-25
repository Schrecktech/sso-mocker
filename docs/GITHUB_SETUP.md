# GitHub Setup Guide

Step-by-step instructions for setting up the SSO Mocker project in GitHub, from repository creation through first release.

## Prerequisites

- A GitHub organization (referred to as `schrecktech` throughout this guide)
- `gh` CLI installed and authenticated (`gh auth login`)
- Node.js 22+ installed locally
- Docker installed locally (for testing the image build)
- Org-level admin access (for GitHub Pages, branch protection, and package settings)

## Step 1: Create the GitHub Repository

```bash
# Create the repo (private by default; use --public if desired)
gh repo create schrecktech/sso-mocker \
  --description "Configurable OIDC identity provider for dev, CI, and non-production environments" \
  --private \
  --clone

cd sso-mocker
```

If you already have the local project (this repo), connect it instead:

```bash
cd /path/to/sso-mocker
git remote add origin https://github.com/schrecktech/sso-mocker.git
```

## Step 2: Push Initial Code

```bash
git push -u origin main
```

## Step 3: Configure GitHub Packages (npm)

SSO Mocker publishes to GitHub's npm registry, not the public npm registry.

### 3a. Set the package scope in `package.json`

Ensure `package.json` has:

```json
{
  "name": "@schrecktech/sso-mocker",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

### 3b. Configure consuming repos to install from GitHub Packages

Each repo that uses `@schrecktech/sso-mocker` needs a `.npmrc` file:

```
@schrecktech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

In GitHub Actions, `GITHUB_TOKEN` is automatically available. For local dev:

```bash
# Authenticate once (creates ~/.npmrc entry)
npm login --scope=@schrecktech --registry=https://npm.pkg.github.com
# Use your GitHub username and a Personal Access Token (PAT) with read:packages scope
```

### 3c. Set package visibility

After the first publish, configure package visibility:

1. Go to `https://github.com/orgs/schrecktech/packages/npm/sso-mocker/settings`
2. Under "Manage access", add teams/users that need to pull the package
3. For org-wide access: "Inherit access from source repository" is usually sufficient

## Step 4: Configure GitHub Container Registry (GHCR)

### 4a. Verify GHCR is enabled for the org

1. Go to `https://github.com/organizations/schrecktech/settings/packages`
2. Ensure "Container images" is enabled under "Packages permissions"

### 4b. Set default package visibility (optional)

Under the same settings page, you can set the default visibility for new container images.

### 4c. Test the Docker build locally

```bash
docker build -t sso-mocker:test .
docker run -p 9090:9090 sso-mocker:test
# In another terminal:
curl http://localhost:9090/.well-known/openid-configuration
```

### 4d. After first publish, configure image access

1. Go to `https://github.com/orgs/schrecktech/packages/container/sso-mocker/settings`
2. Under "Manage access", add teams/repos that need to pull the image
3. For GitHub Actions in other repos to pull the image, those repos need `packages: read` permission in their workflow

## Step 5: Set Up Branch Protection

Protect the `main` branch to enforce CI checks and the fixtures guard.

### Via GitHub UI:

1. Go to `https://github.com/schrecktech/sso-mocker/settings/branches`
2. Click "Add branch protection rule"
3. Branch name pattern: `main`
4. Enable these settings:
   - [x] **Require a pull request before merging**
     - [x] Require approvals: 1 (adjust to your team size)
   - [x] **Require status checks to pass before merging**
     - [x] Require branches to be up to date before merging
     - Search and add these required status checks:
       - `test` (from `ci.yml`)
       - `check` (from `fixtures-guard.yml`)
   - [x] **Do not allow bypassing the above settings**
5. Click "Create"

### Via `gh` CLI:

```bash
# Note: branch protection via CLI requires GitHub API calls
gh api repos/schrecktech/sso-mocker/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["test","check"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field restrictions=null
```

## Step 6: Add Repository Secrets

The release workflow needs minimal secrets (it uses `GITHUB_TOKEN` for both npm and GHCR). However, staging/production deployments may need additional secrets.

### 6a. Secrets needed for CI/release (none required)

The `release.yml` workflow uses `${{ secrets.GITHUB_TOKEN }}` which is automatically provided by GitHub Actions. No manual secret creation needed for npm or GHCR publishing.

### 6b. Secrets for staging/production (if deploying to EKS)

```bash
# Add secrets for staging deployment
gh secret set STAGING_REDIS_URL --body "redis://your-redis:6379"
gh secret set STAGING_SIGNING_KEYS --body '[{"kty":"RSA","n":"...","e":"AQAB","d":"..."}]'
gh secret set STAGING_ADMIN_API_KEY --body "$(openssl rand -hex 32)"

# Add secrets for production deployment (when ready)
gh secret set PRODUCTION_REDIS_URL --body "redis://your-redis:6379"
gh secret set PRODUCTION_SIGNING_KEYS --body '[{"kty":"RSA","n":"...","e":"AQAB","d":"..."}]'
gh secret set PRODUCTION_ADMIN_API_KEY --body "$(openssl rand -hex 32)"
```

### 6c. Generate signing keys

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

Save the output and use it as the value for `*_SIGNING_KEYS` secrets.

## Step 7: Set Up GitHub Pages (Org-Level OIDC Discovery)

This step configures the org-level GitHub Pages to serve the `.well-known/openid-configuration` discovery document.

### 7a. Create the org Pages repo (if it doesn't exist)

GitHub org-level Pages are served from a repo named `schrecktech.github.io`:

```bash
# Check if it exists
gh repo view schrecktech/schrecktech.github.io 2>/dev/null || \
  gh repo create schrecktech/schrecktech.github.io --public --clone
```

### 7b. Add the discovery document

```bash
cd schrecktech.github.io

# Prevent Jekyll from ignoring .well-known directory
touch .nojekyll

# Create the .well-known directory
mkdir -p .well-known

# Create the discovery document
# IMPORTANT: Update the endpoint URLs to match your actual OIDC server
cat > .well-known/openid-configuration << 'DISCOVERY'
{
  "issuer": "https://schrecktech.github.io",
  "authorization_endpoint": "https://sso-mocker.staging.example.com/auth",
  "token_endpoint": "https://sso-mocker.staging.example.com/token",
  "userinfo_endpoint": "https://sso-mocker.staging.example.com/me",
  "jwks_uri": "https://sso-mocker.staging.example.com/jwks",
  "registration_endpoint": "https://sso-mocker.staging.example.com/reg",
  "scopes_supported": ["openid", "profile", "email"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "none"]
}
DISCOVERY

git add -A
git commit -m "Add OIDC discovery document for SSO Mocker"
git push
```

### 7c. Enable GitHub Pages

1. Go to `https://github.com/schrecktech/schrecktech.github.io/settings/pages`
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`
4. Click "Save"

### 7d. Verify the discovery document

Wait 1-2 minutes for Pages to deploy, then:

```bash
curl https://schrecktech.github.io/.well-known/openid-configuration
```

You should see the JSON discovery document. If you get a 404, check:
- The `.nojekyll` file exists in the repo root
- GitHub Pages is enabled and deployed (check the "Actions" tab for the pages build)
- The file is named exactly `openid-configuration` (no extension)

### 7e. Verify Content-Type

```bash
curl -I https://schrecktech.github.io/.well-known/openid-configuration 2>/dev/null | grep content-type
```

GitHub Pages may serve this as `application/octet-stream` since the file has no extension. Most OIDC client libraries handle this gracefully, but if your client rejects it, workarounds include:

1. Rename to `openid-configuration.json` and configure clients to use that URL (non-standard but functional)
2. Use a CDN or reverse proxy in front of GitHub Pages that overrides Content-Type
3. Test with your specific OIDC client library — most are lenient

### 7f. Automate discovery doc updates (in sso-mocker repo)

The `pages-deploy.yml` workflow in the sso-mocker repo should automatically update the discovery document when the OIDC server's endpoints change. This workflow:

1. Generates the discovery JSON from the sso-mocker's config
2. Commits it to the `schrecktech.github.io` repo
3. GitHub Pages auto-deploys

To set this up, the sso-mocker repo needs a PAT or deploy key with write access to `schrecktech.github.io`:

```bash
# Create a fine-grained PAT with contents:write on schrecktech.github.io repo
# Then add it as a secret in the sso-mocker repo:
gh secret set PAGES_DEPLOY_TOKEN --body "ghp_your_token_here" --repo schrecktech/sso-mocker
```

## Step 8: Configure GitHub Actions Permissions

### 8a. Org-level Actions permissions

1. Go to `https://github.com/organizations/schrecktech/settings/actions`
2. Under "Workflow permissions", select **Read and write permissions**
3. Check **Allow GitHub Actions to create and approve pull requests** (optional, for automated PRs)

### 8b. Repo-level Actions permissions

1. Go to `https://github.com/schrecktech/sso-mocker/settings/actions`
2. Under "Workflow permissions", select **Read and write permissions**
   - This is needed for the release workflow to push packages to GHCR and npm

## Step 9: Set Up Environments (Optional)

GitHub Environments add approval gates and environment-specific secrets.

### 9a. Create environments

1. Go to `https://github.com/schrecktech/sso-mocker/settings/environments`
2. Create these environments:

| Environment | Protection Rules | Use |
|---|---|---|
| `staging` | None (auto-deploy) | Staging EKS deployment |
| `demo` | None or manual approval | Demo environment |
| `production` | Required reviewers (2+) | Production deployment |

### 9b. Add environment-specific secrets

For each environment, add the relevant secrets (Redis URL, signing keys, Admin API key). This keeps staging and production secrets separate and gated.

### Via UI:

1. Click the environment name
2. Click "Add secret"
3. Add `REDIS_URL`, `SIGNING_KEYS`, `ADMIN_API_KEY`

### Via CLI:

```bash
gh secret set REDIS_URL --env staging --body "redis://staging-redis:6379"
gh secret set SIGNING_KEYS --env staging --body '[{"kty":"RSA",...}]'
gh secret set ADMIN_API_KEY --env staging --body "$(openssl rand -hex 32)"
```

## Step 10: First Release

### 10a. Verify CI passes

```bash
# Create a PR to trigger CI
git checkout -b initial-setup
# Make any needed changes
git push -u origin initial-setup
gh pr create --title "Initial project setup" --body "First PR to verify CI pipeline"
```

Wait for the `test` and `check` status checks to pass, then merge.

### 10b. Tag and release

```bash
git checkout main
git pull

# Tag the first version
git tag v0.1.0
git push origin v0.1.0
```

This triggers `release.yml` which:
1. Publishes `@schrecktech/sso-mocker@0.1.0` to GitHub Packages (npm)
2. Builds and pushes `ghcr.io/schrecktech/sso-mocker:v0.1.0` and `ghcr.io/schrecktech/sso-mocker:latest` to GHCR

### 10c. Verify the release

```bash
# Check npm package
npm view @schrecktech/sso-mocker --registry=https://npm.pkg.github.com

# Check Docker image
docker pull ghcr.io/schrecktech/sso-mocker:v0.1.0
docker run -p 9090:9090 ghcr.io/schrecktech/sso-mocker:v0.1.0
curl http://localhost:9090/.well-known/openid-configuration

# Check GitHub release
gh release view v0.1.0
```

## Step 11: Set Up Consuming Repos

For each repo that needs to use SSO Mocker:

### 11a. Add `.npmrc` (if using npm package)

```bash
# In the consuming repo root
echo "@schrecktech:registry=https://npm.pkg.github.com" > .npmrc
```

### 11b. Add as dev dependency (if using programmatic API)

```bash
npm install --save-dev @schrecktech/sso-mocker
```

### 11c. Add GitHub Actions workflow

Copy the service container snippet into your test workflow:

```yaml
# .github/workflows/test.yml
name: Tests
on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      packages: read                # Needed to pull from GHCR
    services:
      sso-mocker:
        image: ghcr.io/schrecktech/sso-mocker:latest
        credentials:
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
        env:
          SSO_MOCKER_ENV: integration
          SSO_MOCKER_LOGIN_MODE: auto
        ports:
          - 9090:9090
        options: >-
          --health-cmd "wget -qO- http://localhost:9090/.well-known/openid-configuration || exit 1"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
        env:
          OIDC_ISSUER: http://localhost:9090
```

Note the `credentials` block and `packages: read` permission — these are required to pull from a private GHCR image.

## Step 12: Set Up the Reusable Workflow (Optional)

For org-wide adoption, create a reusable workflow in the org's shared `.github` repo.

### 12a. Create the shared workflow

```bash
gh repo view schrecktech/.github 2>/dev/null || \
  gh repo create schrecktech/.github --public

cd .github  # or clone it
mkdir -p workflow-templates
```

Create `.github/workflows/sso-mocker-setup.yml`:

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

jobs:
  sso-mocker:
    runs-on: ubuntu-latest
    permissions:
      packages: read
    services:
      sso-mocker:
        image: ghcr.io/schrecktech/sso-mocker:${{ inputs.mocker-version }}
        credentials:
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
        env:
          SSO_MOCKER_ENV: ${{ inputs.environment }}
          SSO_MOCKER_LOGIN_MODE: ${{ inputs.login-mode }}
          SSO_MOCKER_AUTO_LOGIN_USER: ${{ inputs.auto-login-user }}
        ports:
          - 9090:9090
        options: >-
          --health-cmd "wget -qO- http://localhost:9090/.well-known/openid-configuration || exit 1"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
```

### 12b. Consuming repos reference it

```yaml
jobs:
  test:
    uses: schrecktech/.github/.github/workflows/sso-mocker-setup.yml@main
    with:
      login-mode: form
      auto-login-user: alice
```

## Verification Checklist

After completing all steps, verify:

- [ ] `gh repo view schrecktech/sso-mocker` shows the repo
- [ ] `main` branch has protection rules with required status checks
- [ ] CI workflows run on pull requests (`test` and `check` jobs)
- [ ] `fixtures-guard.yml` blocks PRs with production user fixtures
- [ ] First version tag triggers `release.yml`
- [ ] npm package is published to `https://github.com/orgs/schrecktech/packages/npm/sso-mocker`
- [ ] Docker image is published to `https://github.com/orgs/schrecktech/packages/container/sso-mocker`
- [ ] `https://schrecktech.github.io/.well-known/openid-configuration` returns the discovery JSON
- [ ] A consuming repo can pull the Docker image in GitHub Actions
- [ ] A consuming repo can install the npm package via `@schrecktech/sso-mocker`
- [ ] Local dev works: `npx @schrecktech/sso-mocker start` or `docker run ghcr.io/schrecktech/sso-mocker:latest`
