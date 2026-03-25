# SSO Mocker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a configurable OIDC identity provider for dev, CI, staging, and production environments, built on `oidc-provider`.

**Architecture:** Single Node.js/TypeScript process serving OIDC endpoints (via `oidc-provider`), an Admin REST API, and a server-rendered login UI. Storage is pluggable via an adapter interface (in-memory for dev/CI, Redis for multi-replica). Configuration is YAML-based with environment-specific layering and user fixtures separated from structure definitions.

**Tech Stack:** Node.js 22, TypeScript, oidc-provider v9, Koa, Zod, Vitest, supertest, Playwright, Docker (node:22-alpine)

**Spec:** `docs/superpowers/specs/2026-03-24-sso-mocker-design.md`

---

## Chunk 1: Project Foundation

Project scaffolding, configuration system, and Zod schemas. After this chunk, the config loader is fully working and tested.

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
cd /local/home/scoschre/temp/sso-mocker
npm init -y
```

Then edit `package.json`:

```json
{
  "name": "@schrecktech/sso-mocker",
  "version": "0.1.0",
  "description": "Configurable OIDC identity provider for dev, CI, and non-production environments",
  "type": "module",
  "main": "dist/server.js",
  "bin": {
    "sso-mocker": "bin/sso-mocker.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/server.ts",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run test/unit",
    "test:integration": "vitest run test/integration",
    "test:e2e": "playwright test",
    "lint": "eslint src test",
    "typecheck": "tsc --noEmit"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "license": "MIT",
  "engines": {
    "node": ">=22"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install oidc-provider koa @koa/router @koa/cors yaml zod ioredis
npm install -D typescript tsx vitest supertest @types/supertest @types/koa @types/koa__router @types/koa__cors
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    testTimeout: 15000,
  },
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.env
*.tgz
coverage/
test-results/
playwright-report/
```

- [ ] **Step 6: Verify setup compiles**

```bash
mkdir -p src && echo 'export const VERSION = "0.1.0";' > src/version.ts
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/version.ts
git commit -m "feat: project scaffolding with TypeScript, Vitest, oidc-provider"
```

---

### Task 2: Config Zod Schemas

**Files:**
- Create: `src/config/schema.ts`
- Create: `test/unit/config-schema.test.ts`

- [ ] **Step 1: Write failing tests for config schema**

Create `test/unit/config-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  ServerSchema,
  StorageSchema,
  LoginSchema,
  ClientSchema,
  TeamSchema,
  RoleSchema,
  UserSchema,
  AdminSchema,
  AppConfigSchema,
} from '../../src/config/schema.js';

describe('config schemas', () => {
  describe('ServerSchema', () => {
    it('accepts valid server config', () => {
      const result = ServerSchema.parse({ port: 9090, issuer: 'http://localhost:9090' });
      expect(result.port).toBe(9090);
    });

    it('applies defaults', () => {
      const result = ServerSchema.parse({});
      expect(result.port).toBe(9090);
      expect(result.issuer).toBe('http://localhost:9090');
    });

    it('rejects invalid port', () => {
      expect(() => ServerSchema.parse({ port: -1 })).toThrow();
    });
  });

  describe('StorageSchema', () => {
    it('defaults to memory adapter', () => {
      const result = StorageSchema.parse({});
      expect(result.adapter).toBe('memory');
    });

    it('accepts redis with url', () => {
      const result = StorageSchema.parse({ adapter: 'redis', redis: { url: 'redis://localhost:6379' } });
      expect(result.adapter).toBe('redis');
    });
  });

  describe('LoginSchema', () => {
    it('defaults to form mode', () => {
      const result = LoginSchema.parse({});
      expect(result.mode).toBe('form');
    });
  });

  describe('ClientSchema', () => {
    it('accepts a public PKCE client', () => {
      const result = ClientSchema.parse({
        clientId: 'my-spa',
        clientSecret: null,
        redirectUris: ['http://localhost:3000/callback'],
        grantTypes: ['authorization_code'],
        scopes: [],
        tokenEndpointAuthMethod: 'none',
      });
      expect(result.clientId).toBe('my-spa');
    });

    it('accepts a confidential client', () => {
      const result = ClientSchema.parse({
        clientId: 'my-backend',
        clientSecret: 'secret',
        grantTypes: ['client_credentials'],
        scopes: ['read:users'],
        tokenEndpointAuthMethod: 'client_secret_basic',
      });
      expect(result.clientSecret).toBe('secret');
    });
  });

  describe('TeamSchema', () => {
    it('accepts valid team', () => {
      const result = TeamSchema.parse({ id: 'eng', name: 'Engineering', scopes: ['read:repos'] });
      expect(result.id).toBe('eng');
    });
  });

  describe('RoleSchema', () => {
    it('accepts wildcard scopes', () => {
      const result = RoleSchema.parse({ id: 'admin', name: 'Admin', scopes: ['*'] });
      expect(result.scopes).toEqual(['*']);
    });
  });

  describe('UserSchema', () => {
    it('accepts valid user', () => {
      const result = UserSchema.parse({
        id: 'alice',
        email: 'alice@example.com',
        name: 'Alice',
        role: 'admin',
        teams: ['eng'],
      });
      expect(result.id).toBe('alice');
    });
  });

  describe('AdminSchema', () => {
    it('defaults to enabled with no apiKey', () => {
      const result = AdminSchema.parse({});
      expect(result.enabled).toBe(true);
      expect(result.apiKey).toBeNull();
    });
  });

  describe('AppConfigSchema', () => {
    it('accepts a minimal config', () => {
      const result = AppConfigSchema.parse({});
      expect(result.server.port).toBe(9090);
      expect(result.storage.adapter).toBe('memory');
      expect(result.clients).toEqual([]);
      expect(result.teams).toEqual([]);
      expect(result.roles).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run test/unit/config-schema.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement config schemas**

Create `src/config/schema.ts`:

```typescript
import { z } from 'zod';

export const ServerSchema = z.object({
  port: z.number().int().min(0).max(65535).default(9090),
  issuer: z.string().url().default('http://localhost:9090'),
}).default({});

export const RedisSchema = z.object({
  url: z.string(),
}).optional();

export const StorageSchema = z.object({
  adapter: z.enum(['memory', 'redis']).default('memory'),
  redis: RedisSchema,
}).default({});

export const LoginSchema = z.object({
  mode: z.enum(['auto', 'form']).default('form'),
  autoLoginUser: z.string().default('alice'),
}).default({});

export const SigningSchema = z.object({
  keys: z.any().default([]),
}).default({});

export const TokensSchema = z.object({
  idToken: z.object({ ttl: z.number().int().positive().default(3600) }).default({}),
  accessToken: z.object({
    ttl: z.number().int().positive().default(3600),
    format: z.enum(['jwt', 'opaque']).default('jwt'),
  }).default({}),
  refreshToken: z.object({
    ttl: z.number().int().positive().default(86400),
    enabled: z.boolean().default(true),
  }).default({}),
}).default({});

export const ClientSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().nullable().default(null),
  redirectUris: z.array(z.string()).default([]),
  grantTypes: z.array(z.string()),
  scopes: z.array(z.string()).default([]),
  tokenEndpointAuthMethod: z.enum(['none', 'client_secret_basic', 'client_secret_post']).default('client_secret_basic'),
});

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
});

export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
});

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  teams: z.array(z.string()).default([]),
});

export const CorsSchema = z.object({
  allowedOrigins: z.array(z.string()).default([]),
}).default({});

export const LoggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
}).default({});

export const AdminSchema = z.object({
  enabled: z.boolean().default(true),
  apiKey: z.string().nullable().default(null),
}).default({});

export const AppConfigSchema = z.object({
  server: ServerSchema,
  storage: StorageSchema,
  login: LoginSchema,
  signing: SigningSchema,
  tokens: TokensSchema,
  clients: z.array(ClientSchema).default([]),
  teams: z.array(TeamSchema).default([]),
  roles: z.array(RoleSchema).default([]),
  cors: CorsSchema,
  logging: LoggingSchema,
  admin: AdminSchema,
}).default({});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type User = z.infer<typeof UserSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Client = z.infer<typeof ClientSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run test/unit/config-schema.test.ts
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts test/unit/config-schema.test.ts
git commit -m "feat: add Zod config schemas with defaults and validation"
```

---

### Task 3: Environment Variable Interpolation

**Files:**
- Create: `src/config/interpolate.ts`
- Create: `test/unit/interpolate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/unit/interpolate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { interpolateEnvVars } from '../../src/config/interpolate.js';

describe('interpolateEnvVars', () => {
  beforeEach(() => {
    vi.stubEnv('TEST_VAR', 'hello');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('replaces ${VAR} with env value', () => {
    expect(interpolateEnvVars('${TEST_VAR}')).toBe('hello');
  });

  it('replaces multiple vars in one string', () => {
    expect(interpolateEnvVars('${TEST_VAR}-${REDIS_URL}')).toBe('hello-redis://localhost:6379');
  });

  it('leaves strings without ${} unchanged', () => {
    expect(interpolateEnvVars('no vars here')).toBe('no vars here');
  });

  it('throws on missing required env var', () => {
    expect(() => interpolateEnvVars('${MISSING_VAR}')).toThrow('MISSING_VAR');
  });

  it('recursively interpolates objects', () => {
    const input = { url: '${REDIS_URL}', nested: { val: '${TEST_VAR}' } };
    const result = interpolateEnvVars(input);
    expect(result).toEqual({ url: 'redis://localhost:6379', nested: { val: 'hello' } });
  });

  it('recursively interpolates arrays', () => {
    const input = ['${TEST_VAR}', 'literal'];
    const result = interpolateEnvVars(input);
    expect(result).toEqual(['hello', 'literal']);
  });

  it('passes through numbers and booleans', () => {
    expect(interpolateEnvVars(42)).toBe(42);
    expect(interpolateEnvVars(true)).toBe(true);
  });

  it('passes through null', () => {
    expect(interpolateEnvVars(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run test/unit/interpolate.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement interpolation**

Create `src/config/interpolate.ts`:

```typescript
const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

export function interpolateEnvVars<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const result = value.replace(ENV_VAR_PATTERN, (_, varName: string) => {
      const envVal = process.env[varName];
      if (envVal === undefined) {
        throw new Error(`Missing required environment variable: ${varName}`);
      }
      return envVal;
    });
    return result as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateEnvVars(item)) as T;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = interpolateEnvVars(val);
    }
    return result as T;
  }

  return value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run test/unit/interpolate.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/interpolate.ts test/unit/interpolate.test.ts
git commit -m "feat: add environment variable interpolation for YAML configs"
```

---

### Task 4: Config Loader

**Files:**
- Create: `src/config/loader.ts`
- Create: `test/unit/config-loader.test.ts`
- Create: `config/default.yaml`
- Create: `config/development.yaml`
- Create: `config/integration.yaml`
- Create: `config/staging.yaml`
- Create: `config/production.yaml`
- Create: `fixtures/development.users.yaml`
- Create: `fixtures/integration.users.yaml`

- [ ] **Step 1: Create YAML config files**

Create `config/default.yaml`:

```yaml
server:
  port: 9090
  issuer: "http://localhost:9090"

storage:
  adapter: "memory"

login:
  mode: "form"
  autoLoginUser: "alice"

signing:
  keys: []

tokens:
  idToken:
    ttl: 3600
  accessToken:
    ttl: 3600
    format: "jwt"
  refreshToken:
    ttl: 86400
    enabled: true

clients:
  - clientId: "my-spa"
    clientSecret: null
    redirectUris:
      - "http://localhost:3000/callback"
    grantTypes:
      - "authorization_code"
    scopes: []
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
    scopes:
      - "read:repos"
      - "write:repos"
      - "read:ci"

  - id: "billing"
    name: "Billing"
    scopes:
      - "read:invoices"
      - "write:invoices"

roles:
  - id: "admin"
    name: "Administrator"
    scopes:
      - "*"

  - id: "editor"
    name: "Editor"
    scopes:
      - "read:*"
      - "write:*"

  - id: "viewer"
    name: "Viewer"
    scopes:
      - "read:*"

cors:
  allowedOrigins: []

logging:
  level: "info"

admin:
  enabled: true
  apiKey: null
```

Create `config/development.yaml`:

```yaml
server:
  issuer: "http://localhost:9090"

login:
  mode: "form"
```

Create `config/integration.yaml`:

```yaml
server:
  issuer: "http://sso-mocker:9090"

login:
  mode: "auto"
  autoLoginUser: "alice"
```

Create `config/staging.yaml`:

```yaml
server:
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

Create `config/production.yaml`:

```yaml
server:
  issuer: "https://sso-mocker.prod.example.com"

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

Create `fixtures/development.users.yaml`:

```yaml
users:
  - id: "alice"
    email: "alice@example.com"
    name: "Alice Admin"
    role: "admin"
    teams:
      - "engineering"

  - id: "bob"
    email: "bob@example.com"
    name: "Bob Editor"
    role: "editor"
    teams:
      - "engineering"
      - "billing"

  - id: "carol"
    email: "carol@example.com"
    name: "Carol Viewer"
    role: "viewer"
    teams:
      - "billing"
```

Create `fixtures/integration.users.yaml`:

```yaml
users:
  - id: "alice"
    email: "alice@example.com"
    name: "Alice Admin"
    role: "admin"
    teams:
      - "engineering"

  - id: "test-admin"
    email: "test-admin@ci.local"
    name: "CI Admin"
    role: "admin"
    teams:
      - "engineering"

  - id: "test-viewer"
    email: "test-viewer@ci.local"
    name: "CI Viewer"
    role: "viewer"
    teams: []
```

- [ ] **Step 2: Write failing tests for config loader**

Create `test/unit/config-loader.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import path from 'node:path';

const CONFIG_DIR = path.resolve('config');
const FIXTURES_DIR = path.resolve('fixtures');

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads default config', async () => {
    const config = await loadConfig({
      env: 'development',
      configDir: CONFIG_DIR,
      fixturesDir: FIXTURES_DIR,
    });
    expect(config.config.server.port).toBe(9090);
    expect(config.config.clients).toHaveLength(2);
    expect(config.config.teams).toHaveLength(2);
    expect(config.config.roles).toHaveLength(3);
  });

  it('loads user fixtures for development', async () => {
    const config = await loadConfig({
      env: 'development',
      configDir: CONFIG_DIR,
      fixturesDir: FIXTURES_DIR,
    });
    expect(config.users).toHaveLength(3);
    expect(config.users[0].id).toBe('alice');
  });

  it('merges environment overrides', async () => {
    const config = await loadConfig({
      env: 'integration',
      configDir: CONFIG_DIR,
      fixturesDir: FIXTURES_DIR,
    });
    expect(config.config.login.mode).toBe('auto');
    expect(config.config.server.issuer).toBe('http://sso-mocker:9090');
  });

  it('loads integration fixtures', async () => {
    const config = await loadConfig({
      env: 'integration',
      configDir: CONFIG_DIR,
      fixturesDir: FIXTURES_DIR,
    });
    expect(config.users.find((u) => u.id === 'test-admin')).toBeDefined();
  });

  it('rejects fixtures in production mode', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost');
    vi.stubEnv('SIGNING_KEYS_JSON', '[]');
    vi.stubEnv('ADMIN_API_KEY', 'secret');

    await expect(
      loadConfig({
        env: 'production',
        configDir: CONFIG_DIR,
        fixturesDir: FIXTURES_DIR,
        // Simulate a fixtures file existing for production
        forceFixturesExist: true,
      })
    ).rejects.toThrow('User fixtures are not allowed in production');
  });

  it('rejects production with no Admin API key', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost');
    vi.stubEnv('SIGNING_KEYS_JSON', '[]');

    await expect(
      loadConfig({
        env: 'production',
        configDir: CONFIG_DIR,
        fixturesDir: FIXTURES_DIR,
      })
    ).rejects.toThrow('Admin API must be secured');
  });

  it('applies CLI overrides', async () => {
    const config = await loadConfig({
      env: 'development',
      configDir: CONFIG_DIR,
      fixturesDir: FIXTURES_DIR,
      overrides: { port: 8080, loginMode: 'auto' },
    });
    expect(config.config.server.port).toBe(8080);
    expect(config.config.login.mode).toBe('auto');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run test/unit/config-loader.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement config loader**

Create `src/config/loader.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AppConfigSchema, UserSchema, type AppConfig, type User } from './schema.js';
import { interpolateEnvVars } from './interpolate.js';

export interface LoadConfigOptions {
  env: string;
  configDir: string;
  fixturesDir: string;
  overrides?: { port?: number; loginMode?: 'auto' | 'form' };
  forceFixturesExist?: boolean;
}

export interface LoadedConfig {
  config: AppConfig;
  users: User[];
  environment: string;
}

async function readYamlFile(filePath: string): Promise<Record<string, unknown>> {
  if (!existsSync(filePath)) return {};
  const content = await readFile(filePath, 'utf-8');
  return parseYaml(content) ?? {};
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const { env, configDir, fixturesDir, overrides } = options;

  // 1. Load default.yaml
  const defaultConfig = await readYamlFile(path.join(configDir, 'default.yaml'));

  // 2. Load {env}.yaml and merge
  const envConfig = await readYamlFile(path.join(configDir, `${env}.yaml`));
  let merged = deepMerge(defaultConfig, envConfig);

  // 3. Interpolate env vars (skip for dev/integration where vars may not exist)
  try {
    merged = interpolateEnvVars(merged);
  } catch (e) {
    if (env === 'staging' || env === 'production') throw e;
    // For dev/integration, silently skip missing env vars in non-critical fields
    // Re-interpolate only string fields that don't reference missing vars
    merged = safeInterpolate(merged);
  }

  // 4. Apply CLI overrides
  if (overrides?.port !== undefined) {
    (merged as any).server = { ...(merged as any).server, port: overrides.port };
  }
  if (overrides?.loginMode !== undefined) {
    (merged as any).login = { ...(merged as any).login, mode: overrides.loginMode };
  }

  // 5. Validate with Zod
  const config = AppConfigSchema.parse(merged);

  // 6. Load fixtures
  let users: User[] = [];
  const fixturesFile = path.join(fixturesDir, `${env}.users.yaml`);
  const fixturesExist = existsSync(fixturesFile) || options.forceFixturesExist;

  if (env === 'production' && fixturesExist) {
    throw new Error('User fixtures are not allowed in production environment. Create users via the Admin API instead.');
  }

  if (env === 'production') {
    // Production safety checks
    if (config.admin.enabled && !config.admin.apiKey) {
      throw new Error('Admin API must be secured with an API key in production mode.');
    }
  }

  if (fixturesExist && existsSync(fixturesFile)) {
    const fixturesData = await readYamlFile(fixturesFile);
    const rawUsers = (fixturesData as any).users ?? [];
    users = rawUsers.map((u: unknown) => UserSchema.parse(u));

    if (env === 'staging') {
      console.warn('[sso-mocker] Warning: User fixtures loaded in staging environment.');
    }
  }

  return { config, users, environment: env };
}

function safeInterpolate(obj: unknown): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    try {
      return interpolateEnvVars(obj);
    } catch {
      return obj;
    }
  }
  if (Array.isArray(obj)) return obj.map(safeInterpolate);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = safeInterpolate(v);
    }
    return result;
  }
  return obj;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run test/unit/config-loader.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config/loader.ts test/unit/config-loader.test.ts config/ fixtures/
git commit -m "feat: add config loader with YAML merging, env interpolation, safety checks"
```

---

## Chunk 2: Core Domain Logic

Scope resolver, claim builder, and storage adapters. These are pure logic units with no HTTP dependencies.

### Task 5: Scope Resolver

**Files:**
- Create: `src/oidc/scopes.ts`
- Create: `test/unit/scopes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/unit/scopes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { expandWildcard, resolveEffectiveScopes, buildScopeRegistry } from '../../src/oidc/scopes.js';
import type { Team, Role } from '../../src/config/schema.js';

const REGISTRY = new Set([
  'read:repos', 'write:repos', 'read:ci',
  'read:invoices', 'write:invoices',
]);

describe('buildScopeRegistry', () => {
  it('collects scopes from teams and clients', () => {
    const teams: Team[] = [
      { id: 'eng', name: 'Eng', scopes: ['read:repos', 'write:repos'] },
    ];
    const clients = [
      { clientId: 'x', clientSecret: null, redirectUris: [], grantTypes: [], scopes: ['custom:scope'], tokenEndpointAuthMethod: 'none' as const },
    ];
    const registry = buildScopeRegistry(teams, clients);
    expect(registry.has('read:repos')).toBe(true);
    expect(registry.has('custom:scope')).toBe(true);
  });
});

describe('expandWildcard', () => {
  it('expands * to all scopes', () => {
    const result = expandWildcard('*', REGISTRY);
    expect(result).toEqual(REGISTRY);
  });

  it('expands read:* to all read: scopes', () => {
    const result = expandWildcard('read:*', REGISTRY);
    expect(result).toEqual(new Set(['read:repos', 'read:ci', 'read:invoices']));
  });

  it('returns single scope for non-wildcard', () => {
    const result = expandWildcard('read:repos', REGISTRY);
    expect(result).toEqual(new Set(['read:repos']));
  });
});

describe('resolveEffectiveScopes', () => {
  const roles: Role[] = [
    { id: 'admin', name: 'Admin', scopes: ['*'] },
    { id: 'viewer', name: 'Viewer', scopes: ['read:*'] },
  ];
  const teams: Team[] = [
    { id: 'eng', name: 'Eng', scopes: ['read:repos', 'write:repos', 'read:ci'] },
    { id: 'billing', name: 'Billing', scopes: ['read:invoices', 'write:invoices'] },
  ];

  it('admin gets all scopes', () => {
    const result = resolveEffectiveScopes('admin', ['eng'], roles, teams, REGISTRY);
    expect(result).toEqual(REGISTRY);
  });

  it('viewer gets read scopes plus team scopes', () => {
    const result = resolveEffectiveScopes('viewer', ['billing'], roles, teams, REGISTRY);
    expect(result.has('read:repos')).toBe(true);
    expect(result.has('read:invoices')).toBe(true);
    expect(result.has('write:invoices')).toBe(true); // from team
    expect(result.has('write:repos')).toBe(false);
  });

  it('user with no teams gets only role scopes', () => {
    const result = resolveEffectiveScopes('viewer', [], roles, teams, REGISTRY);
    expect(result.has('write:invoices')).toBe(false);
    expect(result.has('read:repos')).toBe(true);
  });

  it('deduplicates scopes', () => {
    const result = resolveEffectiveScopes('viewer', ['eng'], roles, teams, REGISTRY);
    const arr = [...result];
    expect(arr.length).toBe(new Set(arr).size);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run test/unit/scopes.test.ts
```

- [ ] **Step 3: Implement scope resolver**

Create `src/oidc/scopes.ts`:

```typescript
import type { Team, Role, Client } from '../config/schema.js';

export function buildScopeRegistry(teams: Team[], clients: Client[]): Set<string> {
  const scopes = new Set<string>();
  for (const team of teams) {
    for (const scope of team.scopes) {
      if (!scope.includes('*')) scopes.add(scope);
    }
  }
  for (const client of clients) {
    for (const scope of client.scopes) {
      scopes.add(scope);
    }
  }
  return scopes;
}

export function expandWildcard(pattern: string, registry: Set<string>): Set<string> {
  if (pattern === '*') return new Set(registry);

  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1); // "read:" from "read:*"
    const matched = new Set<string>();
    for (const scope of registry) {
      if (scope.startsWith(prefix)) matched.add(scope);
    }
    return matched;
  }

  return new Set([pattern]);
}

export function resolveEffectiveScopes(
  roleId: string,
  teamIds: string[],
  roles: Role[],
  teams: Team[],
  registry: Set<string>,
): Set<string> {
  const result = new Set<string>();

  // Role scopes
  const role = roles.find((r) => r.id === roleId);
  if (role) {
    for (const scope of role.scopes) {
      for (const expanded of expandWildcard(scope, registry)) {
        result.add(expanded);
      }
    }
  }

  // Team scopes
  for (const teamId of teamIds) {
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      for (const scope of team.scopes) {
        for (const expanded of expandWildcard(scope, registry)) {
          result.add(expanded);
        }
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run test/unit/scopes.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/oidc/scopes.ts test/unit/scopes.test.ts
git commit -m "feat: add scope resolver with wildcard expansion and registry"
```

---

### Task 6: Claim Builder

**Files:**
- Create: `src/oidc/claims.ts`
- Create: `test/unit/claims.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/unit/claims.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildUserClaims } from '../../src/oidc/claims.js';
import type { User, Role, Team } from '../../src/config/schema.js';

const REGISTRY = new Set(['read:repos', 'write:repos', 'read:ci', 'read:invoices', 'write:invoices']);

const roles: Role[] = [
  { id: 'admin', name: 'Admin', scopes: ['*'] },
  { id: 'viewer', name: 'Viewer', scopes: ['read:*'] },
];

const teams: Team[] = [
  { id: 'engineering', name: 'Engineering', scopes: ['read:repos', 'write:repos', 'read:ci'] },
  { id: 'billing', name: 'Billing', scopes: ['read:invoices', 'write:invoices'] },
];

describe('buildUserClaims', () => {
  it('builds claims for admin user', () => {
    const user: User = { id: 'alice', email: 'alice@example.com', name: 'Alice', role: 'admin', teams: ['engineering'] };
    const claims = buildUserClaims(user, roles, teams, REGISTRY);

    expect(claims.sub).toBe('alice');
    expect(claims.email).toBe('alice@example.com');
    expect(claims.name).toBe('Alice');
    expect(claims.role).toBe('admin');
    expect(claims.teams).toEqual(['engineering']);
    expect(claims.scopes).toContain('read:repos');
    expect(claims.scopes).toContain('write:invoices');
    expect(claims.team_scopes.engineering).toEqual(['read:repos', 'write:repos', 'read:ci']);
  });

  it('builds claims for viewer user', () => {
    const user: User = { id: 'carol', email: 'carol@example.com', name: 'Carol', role: 'viewer', teams: ['billing'] };
    const claims = buildUserClaims(user, roles, teams, REGISTRY);

    expect(claims.role).toBe('viewer');
    expect(claims.scopes).toContain('read:repos');
    expect(claims.scopes).toContain('write:invoices'); // from billing team
    expect(claims.scopes).not.toContain('write:repos');
  });

  it('tokens contain only concrete scopes, never wildcards', () => {
    const user: User = { id: 'alice', email: 'a@b.com', name: 'A', role: 'admin', teams: [] };
    const claims = buildUserClaims(user, roles, teams, REGISTRY);

    expect(claims.scopes).not.toContain('*');
    expect(claims.scopes.every((s: string) => !s.includes('*'))).toBe(true);
  });

  it('builds team_scopes map', () => {
    const user: User = { id: 'bob', email: 'b@b.com', name: 'B', role: 'viewer', teams: ['engineering', 'billing'] };
    const claims = buildUserClaims(user, roles, teams, REGISTRY);

    expect(claims.team_scopes.engineering).toEqual(['read:repos', 'write:repos', 'read:ci']);
    expect(claims.team_scopes.billing).toEqual(['read:invoices', 'write:invoices']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run test/unit/claims.test.ts
```

- [ ] **Step 3: Implement claim builder**

Create `src/oidc/claims.ts`:

```typescript
import type { User, Role, Team } from '../config/schema.js';
import { resolveEffectiveScopes } from './scopes.js';

export interface UserClaims {
  sub: string;
  email: string;
  name: string;
  role: string;
  teams: string[];
  scopes: string[];
  team_scopes: Record<string, string[]>;
}

export function buildUserClaims(
  user: User,
  roles: Role[],
  teams: Team[],
  registry: Set<string>,
): UserClaims {
  const effectiveScopes = resolveEffectiveScopes(user.role, user.teams, roles, teams, registry);

  const teamScopes: Record<string, string[]> = {};
  for (const teamId of user.teams) {
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      teamScopes[teamId] = [...team.scopes];
    }
  }

  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teams: [...user.teams],
    scopes: [...effectiveScopes].sort(),
    team_scopes: teamScopes,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run test/unit/claims.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/oidc/claims.ts test/unit/claims.test.ts
git commit -m "feat: add claim builder for user token claims"
```

---

### Task 7: In-Memory Storage Adapter

**Files:**
- Create: `src/store/adapter.ts`
- Create: `src/store/memory.ts`
- Create: `test/unit/store-memory.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/unit/store-memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryAdapter } from '../../src/store/memory.js';

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter('Session');
  });

  it('upserts and finds by id', async () => {
    await adapter.upsert('abc', { data: 'hello' }, 3600);
    const found = await adapter.find('abc');
    expect(found).toEqual({ data: 'hello' });
  });

  it('returns undefined for non-existent id', async () => {
    const found = await adapter.find('nonexistent');
    expect(found).toBeUndefined();
  });

  it('destroys by id', async () => {
    await adapter.upsert('abc', { data: 'hello' }, 3600);
    await adapter.destroy('abc');
    const found = await adapter.find('abc');
    expect(found).toBeUndefined();
  });

  it('consumes marks entry as consumed', async () => {
    await adapter.upsert('abc', { data: 'hello' }, 3600);
    await adapter.consume('abc');
    const found = await adapter.find('abc');
    expect(found).toHaveProperty('consumed');
  });

  it('respects TTL expiration', async () => {
    vi.useFakeTimers();
    adapter = new MemoryAdapter('Session');
    await adapter.upsert('abc', { data: 'hello' }, 1); // 1 second TTL
    vi.advanceTimersByTime(2000);
    const found = await adapter.find('abc');
    expect(found).toBeUndefined();
    vi.useRealTimers();
  });

  it('flushAll clears all entries', async () => {
    await adapter.upsert('a', { x: 1 }, 3600);
    await adapter.upsert('b', { x: 2 }, 3600);
    MemoryAdapter.flushAll();
    expect(await adapter.find('a')).toBeUndefined();
    expect(await adapter.find('b')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run test/unit/store-memory.test.ts
```

- [ ] **Step 3: Implement adapter interface and memory adapter**

Create `src/store/adapter.ts`:

```typescript
export interface StorageAdapter {
  upsert(id: string, payload: Record<string, unknown>, expiresIn: number): Promise<void>;
  find(id: string): Promise<Record<string, unknown> | undefined>;
  destroy(id: string): Promise<void>;
  consume(id: string): Promise<void>;
}
```

Create `src/store/memory.ts`:

```typescript
interface StoredEntry {
  payload: Record<string, unknown>;
  expiresAt: number;
}

const storage = new Map<string, Map<string, StoredEntry>>();

export class MemoryAdapter {
  private name: string;

  constructor(name: string) {
    this.name = name;
    if (!storage.has(name)) {
      storage.set(name, new Map());
    }
  }

  private get store(): Map<string, StoredEntry> {
    return storage.get(this.name)!;
  }

  async upsert(id: string, payload: Record<string, unknown>, expiresIn: number): Promise<void> {
    this.store.set(id, {
      payload: { ...payload },
      expiresAt: Date.now() + expiresIn * 1000,
    });
  }

  async find(id: string): Promise<Record<string, unknown> | undefined> {
    const entry = this.store.get(id);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(id);
      return undefined;
    }
    return { ...entry.payload };
  }

  async destroy(id: string): Promise<void> {
    this.store.delete(id);
  }

  async consume(id: string): Promise<void> {
    const entry = this.store.get(id);
    if (entry) {
      entry.payload.consumed = Math.floor(Date.now() / 1000);
    }
  }

  static flushAll(): void {
    for (const [, store] of storage) {
      store.clear();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run test/unit/store-memory.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/store/adapter.ts src/store/memory.ts test/unit/store-memory.test.ts
git commit -m "feat: add storage adapter interface and in-memory implementation"
```

---

## Chunk 3: OIDC Provider & Login UI

Wire up `oidc-provider`, implement the interaction handler (login), and build the login UI.

### Task 8: OIDC Provider Configuration

**Files:**
- Create: `src/oidc/provider.ts`
- Create: `src/oidc/interactions.ts`
- Create: `src/ui/login.ts`
- Create: `src/ui/templates/login.html`
- Create: `src/health.ts`
- Create: `src/server.ts`
- Create: `test/helpers/mocker.ts`
- Create: `test/integration/discovery.test.ts`

This task is larger because the OIDC provider, interactions, and login UI must work together for the first integration test to pass. They form one functional unit.

- [ ] **Step 1: Create health endpoint**

Create `src/health.ts`:

```typescript
import type { Context } from 'koa';

export function healthHandler(ctx: Context): void {
  ctx.status = 200;
  ctx.body = { status: 'ok' };
}
```

- [ ] **Step 2: Create login UI template**

Create `src/ui/templates/login.html` — a simple HTML template with `{{placeholders}}`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SSO Mocker Login</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 1.4em; }
    .user-list { list-style: none; padding: 0; }
    .user-item { padding: 12px; border: 1px solid #ddd; border-radius: 6px; margin: 8px 0; cursor: pointer; }
    .user-item:hover { background: #f0f0f0; }
    .user-item input[type="radio"] { margin-right: 8px; }
    .user-name { font-weight: bold; }
    .user-meta { color: #666; font-size: 0.9em; }
    .client-info { margin-top: 20px; padding: 12px; background: #f8f8f8; border-radius: 6px; font-size: 0.85em; color: #555; }
    button { padding: 10px 24px; background: #0066cc; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1em; margin-top: 12px; }
    button:hover { background: #0052a3; }
  </style>
</head>
<body>
  <h1>SSO Mocker Login</h1>
  <p>Select a user:</p>
  <form method="POST" action="{{action}}">
    <input type="hidden" name="prompt" value="login">
    <ul class="user-list">
      {{userList}}
    </ul>
    <button type="submit" data-testid="sign-in">Sign In</button>
  </form>
  <div class="client-info">
    <div>Client: {{clientId}}</div>
    <div>Scopes: {{scopes}}</div>
  </div>
</body>
</html>
```

- [ ] **Step 3: Create login UI renderer**

Create `src/ui/login.ts`:

```typescript
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { User } from '../config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = readFileSync(path.join(__dirname, 'templates', 'login.html'), 'utf-8');

export function renderLoginPage(
  users: User[],
  action: string,
  clientId: string,
  scopes: string,
): string {
  const userList = users
    .map(
      (u, i) => `
      <li class="user-item" data-testid="user-${u.id}">
        <label>
          <input type="radio" name="user" value="${u.id}" ${i === 0 ? 'checked' : ''}>
          <span class="user-name">${escapeHtml(u.name)}</span>
          <div class="user-meta">${escapeHtml(u.role)} &middot; ${u.teams.join(', ') || 'no teams'}</div>
        </label>
      </li>`,
    )
    .join('\n');

  return template
    .replace('{{action}}', escapeHtml(action))
    .replace('{{userList}}', userList)
    .replace('{{clientId}}', escapeHtml(clientId))
    .replace('{{scopes}}', escapeHtml(scopes));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Create interaction handler**

Create `src/oidc/interactions.ts`:

```typescript
import type Provider from 'oidc-provider';
import type Router from '@koa/router';
import type { User } from '../config/schema.js';
import { renderLoginPage } from '../ui/login.js';

interface InteractionOptions {
  provider: Provider;
  router: Router;
  getUsers: () => User[];
  getLoginMode: () => { mode: string; autoLoginUser: string };
}

export function mountInteractions({ provider, router, getUsers, getLoginMode }: InteractionOptions): void {
  router.get('/interaction/:uid', async (ctx) => {
    const details = await provider.interactionDetails(ctx.req, ctx.res);
    const loginConfig = getLoginMode();

    if (loginConfig.mode === 'auto') {
      const user = getUsers().find((u) => u.id === loginConfig.autoLoginUser);
      if (!user) {
        ctx.status = 500;
        ctx.body = `autoLoginUser '${loginConfig.autoLoginUser}' not found`;
        return;
      }
      const result = {
        login: { accountId: user.id },
        consent: { grantId: details.grantId },
      };
      await provider.interactionFinished(ctx.req, ctx.res, result, { mergeWithLastSubmission: true });
      return;
    }

    // Form mode
    const clientId = (details.params as any).client_id ?? 'unknown';
    const scopes = (details.params as any).scope ?? 'openid';
    const html = renderLoginPage(getUsers(), `/interaction/${details.uid}`, clientId, scopes);
    ctx.type = 'text/html';
    ctx.body = html;
  });

  router.post('/interaction/:uid', async (ctx) => {
    const body = ctx.request.body as Record<string, string>;
    const userId = body.user;
    const details = await provider.interactionDetails(ctx.req, ctx.res);

    const result = {
      login: { accountId: userId },
      consent: { grantId: details.grantId },
    };
    await provider.interactionFinished(ctx.req, ctx.res, result, { mergeWithLastSubmission: true });
  });
}
```

- [ ] **Step 5: Create OIDC provider setup**

Create `src/oidc/provider.ts`:

```typescript
import Provider from 'oidc-provider';
import type { AppConfig, User } from '../config/schema.js';
import { MemoryAdapter } from '../store/memory.js';
import { buildUserClaims } from './claims.js';
import { buildScopeRegistry } from './scopes.js';

interface ProviderOptions {
  config: AppConfig;
  users: User[];
  roles: AppConfig['roles'];
  teams: AppConfig['teams'];
}

export function createProvider({ config, users, roles, teams }: ProviderOptions): Provider {
  const registry = buildScopeRegistry(teams, config.clients);

  const clients = config.clients.map((c) => ({
    client_id: c.clientId,
    client_secret: c.clientSecret ?? undefined,
    redirect_uris: c.redirectUris,
    grant_types: c.grantTypes,
    response_types: c.grantTypes.includes('authorization_code') ? ['code'] : [],
    token_endpoint_auth_method: c.tokenEndpointAuthMethod,
    scope: c.scopes.length > 0 ? c.scopes.join(' ') : undefined,
  }));

  const provider = new Provider(config.server.issuer, {
    adapter: MemoryAdapter,
    clients,
    claims: {
      openid: ['sub'],
      profile: ['name', 'role', 'teams', 'scopes', 'team_scopes'],
      email: ['email'],
    },
    features: {
      devInteractions: { enabled: false },
      clientCredentials: { enabled: true },
      resourceIndicators: { enabled: false },
    },
    ttl: {
      AccessToken: config.tokens.accessToken.ttl,
      IdToken: config.tokens.idToken.ttl,
      RefreshToken: config.tokens.refreshToken.ttl,
    },
    findAccount: async (_ctx, id) => {
      const user = users.find((u) => u.id === id);
      if (!user) return undefined;
      const claims = buildUserClaims(user, roles, teams, registry);
      return {
        accountId: id,
        async claims() {
          return claims;
        },
      };
    },
    interactions: {
      url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    },
    cookies: {
      keys: ['sso-mocker-cookie-key'],
    },
    jwks: config.signing.keys.length > 0
      ? { keys: config.signing.keys }
      : undefined,
  });

  return provider;
}
```

- [ ] **Step 6: Create server entry point**

Create `src/server.ts`:

```typescript
import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';
import { createProvider } from './oidc/provider.js';
import { mountInteractions } from './oidc/interactions.js';
import { healthHandler } from './health.js';
import { loadConfig, type LoadedConfig } from './config/loader.js';
import type { AppConfig, User } from './config/schema.js';
import path from 'node:path';

export interface MockerInstance {
  app: Koa;
  issuer: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  config: AppConfig;
  users: User[];
}

export interface CreateMockerOptions {
  env?: string;
  port?: number;
  loginMode?: 'auto' | 'form';
  autoLoginUser?: string;
  configDir?: string;
  fixturesDir?: string;
}

export async function createMocker(options: CreateMockerOptions = {}): Promise<MockerInstance> {
  const env = options.env ?? process.env.SSO_MOCKER_ENV ?? 'development';
  const configDir = options.configDir ?? path.resolve('config');
  const fixturesDir = options.fixturesDir ?? path.resolve('fixtures');

  const loaded = await loadConfig({
    env,
    configDir,
    fixturesDir,
    overrides: {
      port: options.port,
      loginMode: options.loginMode,
    },
  });

  const { config } = loaded;
  let { users } = loaded;

  if (options.autoLoginUser) {
    config.login.autoLoginUser = options.autoLoginUser;
  }

  const port = options.port ?? config.server.port;

  // Update issuer for random port
  if (options.port === 0) {
    // Will be updated after listen
  }

  const provider = createProvider({
    config,
    users,
    roles: config.roles,
    teams: config.teams,
  });

  const app = new Koa();
  const router = new Router();

  // CORS
  const corsOrigins = config.cors.allowedOrigins;
  app.use(cors({
    origin: corsOrigins.length > 0 ? (ctx) => {
      const origin = ctx.get('Origin');
      return corsOrigins.includes(origin) ? origin : '';
    } : '*',
  }));

  // Body parser for interaction POST
  app.use(async (ctx, next) => {
    if (ctx.method === 'POST' && ctx.path.startsWith('/interaction/')) {
      const chunks: Buffer[] = [];
      for await (const chunk of ctx.req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString();
      const params = new URLSearchParams(body);
      (ctx.request as any).body = Object.fromEntries(params);
    }
    await next();
  });

  // Health
  router.get('/health', healthHandler);

  // Interactions
  mountInteractions({
    provider,
    router,
    getUsers: () => users,
    getLoginMode: () => ({ mode: config.login.mode, autoLoginUser: config.login.autoLoginUser }),
  });

  app.use(router.routes());
  app.use(router.allowedMethods());
  app.use(provider.callback());

  let server: ReturnType<typeof app.listen> | null = null;
  let resolvedIssuer = config.server.issuer;

  return {
    app,
    get issuer() { return resolvedIssuer; },
    config,
    users,
    start: () => new Promise((resolve) => {
      server = app.listen(port, () => {
        const addr = server!.address();
        if (typeof addr === 'object' && addr) {
          const actualPort = addr.port;
          resolvedIssuer = `http://localhost:${actualPort}`;
          if (options.port === 0) {
            // Re-set the issuer on the provider for random port
            (provider as any).issuer = resolvedIssuer;
          }
        }
        resolve();
      });
    }),
    stop: () => new Promise((resolve, reject) => {
      if (server) {
        server.close((err) => err ? reject(err) : resolve());
      } else {
        resolve();
      }
    }),
  };
}
```

- [ ] **Step 7: Create test helper**

Create `test/helpers/mocker.ts`:

```typescript
import { createMocker, type MockerInstance } from '../../src/server.js';
import path from 'node:path';

export async function startTestMocker(overrides: Record<string, unknown> = {}): Promise<MockerInstance> {
  const mocker = await createMocker({
    env: 'integration',
    port: 0,
    loginMode: 'auto',
    autoLoginUser: 'alice',
    configDir: path.resolve('config'),
    fixturesDir: path.resolve('fixtures'),
    ...overrides,
  });
  await mocker.start();
  return mocker;
}
```

- [ ] **Step 8: Write integration test for OIDC discovery**

Create `test/integration/discovery.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { MockerInstance } from '../../src/server.js';
import { startTestMocker } from '../helpers/mocker.js';

describe('OIDC Discovery', () => {
  let mocker: MockerInstance;

  beforeAll(async () => {
    mocker = await startTestMocker();
  });

  afterAll(async () => {
    await mocker.stop();
  });

  it('serves /.well-known/openid-configuration', async () => {
    const res = await fetch(`${mocker.issuer}/.well-known/openid-configuration`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issuer).toBe(mocker.issuer);
  });

  it('issuer matches configured value', async () => {
    const res = await fetch(`${mocker.issuer}/.well-known/openid-configuration`);
    const body = await res.json();
    expect(body.issuer).toBe(mocker.issuer);
    expect(body.authorization_endpoint).toContain('/auth');
    expect(body.token_endpoint).toContain('/token');
    expect(body.jwks_uri).toContain('/jwks');
  });

  it('jwks endpoint returns valid keys', async () => {
    const disco = await (await fetch(`${mocker.issuer}/.well-known/openid-configuration`)).json();
    const res = await fetch(disco.jwks_uri);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toBeDefined();
    expect(body.keys.length).toBeGreaterThan(0);
  });

  it('health endpoint returns 200', async () => {
    const res = await fetch(`${mocker.issuer}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
```

- [ ] **Step 9: Run integration tests**

```bash
npx vitest run test/integration/discovery.test.ts
```

Expected: all 4 tests PASS. If there are issues, debug and fix — the first time wiring `oidc-provider` often needs tweaks to the provider config.

- [ ] **Step 10: Commit**

```bash
git add src/oidc/provider.ts src/oidc/interactions.ts src/ui/ src/health.ts src/server.ts test/helpers/mocker.ts test/integration/discovery.test.ts
git commit -m "feat: wire up oidc-provider with interactions, login UI, health endpoint"
```

---

## Chunk 4: Admin API

CRUD endpoints for users, roles, teams, clients, plus reset and runtime config.

### Task 9: Admin API - Users CRUD

**Files:**
- Create: `src/admin/router.ts`
- Create: `src/admin/handlers/users.ts`
- Create: `src/admin/validation.ts`
- Create: `test/integration/admin-api.test.ts`

- [ ] **Step 1: Create validation schemas for Admin API**

Create `src/admin/validation.ts`:

```typescript
import { z } from 'zod';

export const CreateUserBody = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.string().min(1),
  teams: z.array(z.string()).default([]),
});

export const PatchUserBody = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  teams: z.array(z.string()).optional(),
});

export const CreateRoleBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scopes: z.array(z.string()),
});

export const PatchRoleBody = z.object({
  name: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
});

export const CreateTeamBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scopes: z.array(z.string()),
});

export const PatchTeamBody = z.object({
  name: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
});

export const PatchLoginConfigBody = z.object({
  mode: z.enum(['auto', 'form']).optional(),
  autoLoginUser: z.string().optional(),
});
```

- [ ] **Step 2: Create users handler**

Create `src/admin/handlers/users.ts`:

```typescript
import type { Context } from 'koa';
import type { User, Role, Team, Client } from '../../config/schema.js';
import { CreateUserBody, PatchUserBody } from '../validation.js';
import { resolveEffectiveScopes, buildScopeRegistry } from '../../oidc/scopes.js';

interface UserHandlerDeps {
  getUsers: () => User[];
  setUsers: (users: User[]) => void;
  getRoles: () => Role[];
  getTeams: () => Team[];
  getClients: () => Client[];
}

function userWithScopes(user: User, deps: UserHandlerDeps) {
  const registry = buildScopeRegistry(deps.getTeams(), deps.getClients());
  const scopes = resolveEffectiveScopes(user.role, user.teams, deps.getRoles(), deps.getTeams(), registry);
  return { ...user, effectiveScopes: [...scopes].sort() };
}

export function createUserHandlers(deps: UserHandlerDeps) {
  return {
    list(ctx: Context) {
      ctx.body = deps.getUsers().map((u) => userWithScopes(u, deps));
    },

    get(ctx: Context) {
      const user = deps.getUsers().find((u) => u.id === ctx.params.id);
      if (!user) { ctx.status = 404; ctx.body = { error: 'not_found', message: `User '${ctx.params.id}' not found` }; return; }
      ctx.body = userWithScopes(user, deps);
    },

    create(ctx: Context) {
      const parsed = CreateUserBody.safeParse(ctx.request.body);
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = { error: 'validation_error', message: parsed.error.message, details: parsed.error.issues };
        return;
      }
      const data = parsed.data;
      const users = deps.getUsers();
      if (users.find((u) => u.id === data.id)) {
        ctx.status = 409; ctx.body = { error: 'conflict', message: `User '${data.id}' already exists` }; return;
      }
      if (!deps.getRoles().find((r) => r.id === data.role)) {
        ctx.status = 400; ctx.body = { error: 'validation_error', message: `Role '${data.role}' does not exist`, details: [{ field: 'role', value: data.role, constraint: 'must reference an existing role' }] }; return;
      }
      for (const teamId of data.teams) {
        if (!deps.getTeams().find((t) => t.id === teamId)) {
          ctx.status = 400; ctx.body = { error: 'validation_error', message: `Team '${teamId}' does not exist`, details: [{ field: 'teams', value: teamId, constraint: 'must reference an existing team' }] }; return;
        }
      }
      const newUser: User = { id: data.id, email: data.email, name: data.name, role: data.role, teams: data.teams };
      deps.setUsers([...users, newUser]);
      ctx.status = 201;
      ctx.body = userWithScopes(newUser, deps);
    },

    update(ctx: Context) {
      const parsed = PatchUserBody.safeParse(ctx.request.body);
      if (!parsed.success) { ctx.status = 400; ctx.body = { error: 'validation_error', message: parsed.error.message }; return; }
      const users = deps.getUsers();
      const idx = users.findIndex((u) => u.id === ctx.params.id);
      if (idx === -1) { ctx.status = 404; ctx.body = { error: 'not_found', message: `User '${ctx.params.id}' not found` }; return; }
      const updated = { ...users[idx], ...parsed.data };
      const newUsers = [...users];
      newUsers[idx] = updated;
      deps.setUsers(newUsers);
      ctx.body = userWithScopes(updated, deps);
    },

    delete(ctx: Context) {
      const users = deps.getUsers();
      const idx = users.findIndex((u) => u.id === ctx.params.id);
      if (idx === -1) { ctx.status = 404; ctx.body = { error: 'not_found', message: `User '${ctx.params.id}' not found` }; return; }
      deps.setUsers(users.filter((u) => u.id !== ctx.params.id));
      ctx.status = 204;
    },
  };
}
```

- [ ] **Step 3: Create admin router (users only for now, other resources follow same pattern)**

Create `src/admin/router.ts`:

```typescript
import Router from '@koa/router';
import type { Context, Next } from 'koa';
import type { AppConfig, User, Role, Team, Client } from '../config/schema.js';
import { createUserHandlers } from './handlers/users.js';
import { MemoryAdapter } from '../store/memory.js';
import { PatchLoginConfigBody } from './validation.js';

export interface AdminState {
  config: AppConfig;
  users: User[];
  baselineUsers: User[];
  baselineConfig: AppConfig;
}

export function createAdminRouter(state: AdminState): Router {
  const router = new Router({ prefix: '/admin/v1' });

  // JSON body parser middleware for admin routes
  router.use(async (ctx: Context, next: Next) => {
    if (['POST', 'PATCH', 'PUT'].includes(ctx.method)) {
      const chunks: Buffer[] = [];
      for await (const chunk of ctx.req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString();
      try {
        (ctx.request as any).body = raw ? JSON.parse(raw) : {};
      } catch {
        ctx.status = 400;
        ctx.body = { error: 'invalid_json', message: 'Request body must be valid JSON' };
        return;
      }
    }
    await next();
  });

  // API key auth middleware
  router.use(async (ctx: Context, next: Next) => {
    if (!state.config.admin.enabled) {
      ctx.status = 404;
      return;
    }
    if (state.config.admin.apiKey) {
      const auth = ctx.get('Authorization');
      if (auth !== `Bearer ${state.config.admin.apiKey}`) {
        ctx.status = 401;
        ctx.body = { error: 'unauthorized', message: 'Invalid or missing API key' };
        return;
      }
    }
    await next();
  });

  // Users
  const userHandlers = createUserHandlers({
    getUsers: () => state.users,
    setUsers: (u) => { state.users = u; },
    getRoles: () => state.config.roles,
    getTeams: () => state.config.teams,
    getClients: () => state.config.clients,
  });

  router.get('/users', userHandlers.list);
  router.get('/users/:id', userHandlers.get);
  router.post('/users', userHandlers.create);
  router.patch('/users/:id', userHandlers.update);
  router.delete('/users/:id', userHandlers.delete);

  // Reset
  router.post('/reset', (ctx: Context) => {
    state.users = [...state.baselineUsers];
    state.config.roles = [...state.baselineConfig.roles];
    state.config.teams = [...state.baselineConfig.teams];
    state.config.clients = [...state.baselineConfig.clients];
    MemoryAdapter.flushAll();
    ctx.status = 200;
    ctx.body = { status: 'reset' };
  });

  router.post('/reset/users', (ctx: Context) => {
    state.users = [...state.baselineUsers];
    ctx.status = 200;
    ctx.body = { status: 'reset' };
  });

  // Login config
  router.patch('/config/login', (ctx: Context) => {
    const parsed = PatchLoginConfigBody.safeParse(ctx.request.body);
    if (!parsed.success) { ctx.status = 400; ctx.body = { error: 'validation_error', message: parsed.error.message }; return; }
    const data = parsed.data;
    if (data.autoLoginUser) {
      const user = state.users.find((u) => u.id === data.autoLoginUser);
      if (!user) {
        ctx.status = 400;
        ctx.body = { error: 'validation_error', message: `User '${data.autoLoginUser}' does not exist` };
        return;
      }
      state.config.login.autoLoginUser = data.autoLoginUser;
    }
    if (data.mode) state.config.login.mode = data.mode;
    ctx.body = { mode: state.config.login.mode, autoLoginUser: state.config.login.autoLoginUser };
  });

  return router;
}
```

- [ ] **Step 4: Write integration tests for Admin API**

Create `test/integration/admin-api.test.ts`:

```typescript
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

  beforeEach(async () => {
    await fetch(`${base}/reset`, { method: 'POST' });
  });

  describe('GET /users', () => {
    it('lists all users', async () => {
      const res = await fetch(`${base}/users`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toHaveProperty('effectiveScopes');
    });
  });

  describe('POST /users', () => {
    it('creates a user', async () => {
      const res = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'dave', email: 'dave@example.com', name: 'Dave', role: 'viewer', teams: [] }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe('dave');
      expect(body.effectiveScopes).toBeDefined();
    });

    it('rejects duplicate id', async () => {
      const res = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'alice', email: 'a@b.com', name: 'A', role: 'admin', teams: [] }),
      });
      expect(res.status).toBe(409);
    });

    it('rejects nonexistent role', async () => {
      const res = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'x', email: 'x@b.com', name: 'X', role: 'superadmin', teams: [] }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('superadmin');
    });
  });

  describe('PATCH /users/:id', () => {
    it('updates user role', async () => {
      const res = await fetch(`${base}/users/alice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'viewer' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe('viewer');
    });
  });

  describe('DELETE /users/:id', () => {
    it('deletes a user', async () => {
      const res = await fetch(`${base}/users/alice`, { method: 'DELETE' });
      expect(res.status).toBe(204);
      const check = await fetch(`${base}/users/alice`);
      expect(check.status).toBe(404);
    });
  });

  describe('POST /reset', () => {
    it('restores state to baseline', async () => {
      await fetch(`${base}/users/alice`, { method: 'DELETE' });
      await fetch(`${base}/reset`, { method: 'POST' });
      const res = await fetch(`${base}/users/alice`);
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /config/login', () => {
    it('changes auto-login user', async () => {
      const res = await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoLoginUser: 'test-viewer' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.autoLoginUser).toBe('test-viewer');
    });

    it('rejects nonexistent user', async () => {
      const res = await fetch(`${base}/config/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoLoginUser: 'nobody' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 5: Wire admin router into server.ts**

Update `src/server.ts` to import and mount the admin router. Add after the health route:

```typescript
import { createAdminRouter, type AdminState } from './admin/router.js';

// In createMocker, after creating the Koa app:
const adminState: AdminState = {
  config,
  users,
  baselineUsers: JSON.parse(JSON.stringify(users)),
  baselineConfig: JSON.parse(JSON.stringify(config)),
};

const adminRouter = createAdminRouter(adminState);
app.use(adminRouter.routes());
app.use(adminRouter.allowedMethods());
```

- [ ] **Step 6: Run integration tests**

```bash
npx vitest run test/integration/admin-api.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/admin/ test/integration/admin-api.test.ts
git commit -m "feat: add Admin API with users CRUD, reset, and login config"
```

---

### Task 10: Admin API - Roles and Teams CRUD

**Files:**
- Create: `src/admin/handlers/roles.ts`
- Create: `src/admin/handlers/teams.ts`
- Modify: `src/admin/router.ts`

Follow the exact same pattern as users handlers. Roles and teams have create/get/list/update/delete. Delete checks for assigned users and returns `409 Conflict` if any exist. Add integration tests to `test/integration/admin-api.test.ts`.

- [ ] **Step 1: Implement roles handler** (same pattern as users)
- [ ] **Step 2: Implement teams handler** (same pattern, plus `GET /teams/:id/members`)
- [ ] **Step 3: Wire into router**
- [ ] **Step 4: Add integration tests for roles and teams CRUD**
- [ ] **Step 5: Run tests**

```bash
npx vitest run test/integration/admin-api.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/admin/handlers/roles.ts src/admin/handlers/teams.ts src/admin/router.ts test/integration/admin-api.test.ts
git commit -m "feat: add roles and teams CRUD to Admin API"
```

---

## Chunk 5: OIDC Flow Integration Tests

Test full OIDC authorization code flow, PKCE, and client credentials against the running mocker.

### Task 11: Auth Code and Client Credentials Integration Tests

**Files:**
- Create: `test/helpers/oidc-client.ts`
- Create: `test/integration/auth-code.test.ts`
- Create: `test/integration/client-credentials.test.ts`

- [ ] **Step 1: Create OIDC client test helper**

Create `test/helpers/oidc-client.ts` — a lightweight helper that performs OIDC flows using plain `fetch`:

```typescript
export async function discoverEndpoints(issuer: string) {
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  return res.json();
}

export async function performClientCredentials(
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
  scope?: string,
) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    ...(scope ? { scope } : {}),
  });
  const res = await fetch(tokenEndpoint, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return { status: res.status, body: await res.json() };
}
```

- [ ] **Step 2: Write client credentials integration test**

Create `test/integration/client-credentials.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestMocker } from '../helpers/mocker.js';
import { discoverEndpoints, performClientCredentials } from '../helpers/oidc-client.js';
import type { MockerInstance } from '../../src/server.js';

describe('Client Credentials Flow', () => {
  let mocker: MockerInstance;
  let tokenEndpoint: string;

  beforeAll(async () => {
    mocker = await startTestMocker();
    const disco = await discoverEndpoints(mocker.issuer);
    tokenEndpoint = disco.token_endpoint;
  });

  afterAll(async () => { await mocker.stop(); });

  it('issues access_token with client scopes', async () => {
    const { status, body } = await performClientCredentials(tokenEndpoint, 'my-backend', 'backend-secret', 'read:users');
    expect(status).toBe(200);
    expect(body.access_token).toBeDefined();
  });

  it('rejects invalid client_secret', async () => {
    const { status } = await performClientCredentials(tokenEndpoint, 'my-backend', 'wrong-secret');
    expect(status).toBe(401);
  });

  it('rejects unknown client_id', async () => {
    const { status } = await performClientCredentials(tokenEndpoint, 'unknown', 'secret');
    expect(status).toBe(401);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run test/integration/client-credentials.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add test/helpers/oidc-client.ts test/integration/client-credentials.test.ts
git commit -m "feat: add client credentials flow integration tests"
```

---

## Chunk 6: CLI, Docker & CI/CD

### Task 12: CLI Entry Point

**Files:**
- Create: `bin/sso-mocker.js`

- [ ] **Step 1: Create CLI**

Create `bin/sso-mocker.js`:

```javascript
#!/usr/bin/env node

import { createMocker } from '../dist/server.js';

const args = process.argv.slice(2);
const command = args[0];

function getFlag(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

if (command === 'start') {
  const env = getFlag('--env') ?? process.env.SSO_MOCKER_ENV ?? 'development';
  const port = getFlag('--port') ? parseInt(getFlag('--port'), 10) : undefined;
  const loginMode = getFlag('--login-mode');

  const mocker = await createMocker({ env, port, loginMode });
  await mocker.start();
  console.log(`[sso-mocker] Running in ${env} mode`);
  console.log(`[sso-mocker] Issuer: ${mocker.issuer}`);
  console.log(`[sso-mocker] Login mode: ${mocker.config.login.mode}`);
  console.log(`[sso-mocker] Users: ${mocker.users.length}`);

  process.on('SIGTERM', async () => {
    console.log('[sso-mocker] Shutting down...');
    await mocker.stop();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    console.log('[sso-mocker] Shutting down...');
    await mocker.stop();
    process.exit(0);
  });
} else if (command === 'config') {
  const env = getFlag('--env') ?? 'development';
  const mocker = await createMocker({ env, port: 0 });
  console.log(JSON.stringify(mocker.config, null, 2));
  await mocker.stop();
} else {
  console.log('Usage: sso-mocker <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  start     Start the SSO Mocker server');
  console.log('  config    Print resolved configuration');
  console.log('');
  console.log('Options:');
  console.log('  --env <name>          Environment (default: development)');
  console.log('  --port <number>       HTTP port (default: 9090)');
  console.log('  --login-mode <mode>   "auto" or "form"');
}
```

- [ ] **Step 2: Test CLI manually**

```bash
npx tsc && node bin/sso-mocker.js config --env development
```

Expected: prints resolved JSON config.

- [ ] **Step 3: Commit**

```bash
git add bin/sso-mocker.js
git commit -m "feat: add CLI entry point with start and config commands"
```

---

### Task 13: Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```
node_modules
dist
.git
test
docs
k8s
*.md
.env
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN addgroup -g 1001 mocker && adduser -u 1001 -G mocker -s /bin/sh -D mocker

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/config ./config
COPY --from=build /app/fixtures ./fixtures
COPY --from=build /app/bin ./bin

USER mocker
EXPOSE 9090

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:9090/health || exit 1

ENTRYPOINT ["node", "bin/sso-mocker.js", "start"]
CMD ["--env", "integration"]
```

- [ ] **Step 3: Create docker-compose.yml**

```yaml
services:
  sso-mocker:
    build: .
    ports:
      - "9090:9090"
    environment:
      SSO_MOCKER_ENV: development
      SSO_MOCKER_LOGIN_MODE: form
```

- [ ] **Step 4: Build and test Docker image**

```bash
docker build -t sso-mocker:test .
docker run -d -p 9090:9090 --name sso-mocker-test sso-mocker:test
sleep 3
curl -sf http://localhost:9090/health && echo " OK" || echo " FAIL"
curl -sf http://localhost:9090/.well-known/openid-configuration | head -c 200
docker stop sso-mocker-test && docker rm sso-mocker-test
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: add Dockerfile and docker-compose for local dev"
```

---

### Task 14: GitHub Actions Workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/workflows/fixtures-guard.yml`
- Create: `scripts/check-no-production-fixtures.js`

- [ ] **Step 1: Create fixtures guard script**

Create `scripts/check-no-production-fixtures.js`:

```javascript
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';

let failed = false;

// Check if fixtures/production.users.yaml exists
if (existsSync('fixtures/production.users.yaml')) {
  console.error('ERROR: fixtures/production.users.yaml must not exist.');
  failed = true;
}

// Check if config/production.yaml has users
if (existsSync('config/production.yaml')) {
  const content = readFileSync('config/production.yaml', 'utf-8');
  const parsed = parse(content);
  if (parsed?.users && Array.isArray(parsed.users) && parsed.users.length > 0) {
    console.error('ERROR: config/production.yaml must not contain users.');
    failed = true;
  }
}

if (failed) {
  console.error('Production fixture guard FAILED. Remove user fixtures from production configs.');
  process.exit(1);
} else {
  console.log('Production fixture guard PASSED.');
}
```

- [ ] **Step 2: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test:unit
      - run: npm run test:integration

  fixtures-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: node scripts/check-no-production-fixtures.js

  docker-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t sso-mocker:ci .
      - run: |
          docker run -d -p 9090:9090 --name smoketest sso-mocker:ci
          timeout 30 bash -c 'until curl -sf http://localhost:9090/health; do sleep 1; done'
          curl -sf http://localhost:9090/.well-known/openid-configuration | jq .issuer
          docker stop smoketest
```

- [ ] **Step 3: Create release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v[0-9]+.[0-9]+.[0-9]+']

permissions:
  contents: write
  packages: write
  id-token: write

jobs:
  publish-npm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://npm.pkg.github.com'
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  publish-docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ github.ref_name }}
            ghcr.io/${{ github.repository }}:latest
```

- [ ] **Step 4: Create fixtures guard workflow**

Create `.github/workflows/fixtures-guard.yml`:

```yaml
name: Fixtures Guard
on:
  pull_request:
    paths:
      - 'config/**'
      - 'fixtures/**'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: node scripts/check-no-production-fixtures.js
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ .github/
git commit -m "feat: add GitHub Actions workflows for CI, release, and fixtures guard"
```

---

## Chunk 7: Kubernetes Manifests

### Task 15: Kustomize Manifests

**Files:**
- Create: `k8s/base/kustomization.yaml`
- Create: `k8s/base/deployment.yaml`
- Create: `k8s/base/service.yaml`
- Create: `k8s/base/configmap.yaml`
- Create: `k8s/overlays/staging/kustomization.yaml`
- Create: `k8s/overlays/staging/ingress.yaml`
- Create: `k8s/overlays/demo/kustomization.yaml`
- Create: `k8s/overlays/demo/ingress.yaml`

- [ ] **Step 1: Create base manifests** (deployment, service, configmap per spec Section 6)
- [ ] **Step 2: Create staging overlay** (2 replicas, Redis, ingress)
- [ ] **Step 3: Create demo overlay** (1 replica, separate namespace)
- [ ] **Step 4: Validate with `kubectl kustomize k8s/overlays/staging`** (if kubectl available)
- [ ] **Step 5: Commit**

```bash
git add k8s/
git commit -m "feat: add Kustomize manifests for EKS staging and demo"
```

---

## Chunk 8: Fixtures Guard Unit Tests

### Task 16: Fixtures Guard Tests

**Files:**
- Create: `test/unit/fixtures-guard.test.ts`

- [ ] **Step 1: Write tests for the guard script logic**

```typescript
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';

describe('fixtures guard', () => {
  it('production.users.yaml does not exist', () => {
    expect(existsSync('fixtures/production.users.yaml')).toBe(false);
  });

  it('production.yaml has no users field', async () => {
    const { readFileSync } = await import('node:fs');
    const { parse } = await import('yaml');
    const content = readFileSync('config/production.yaml', 'utf-8');
    const parsed = parse(content);
    expect(parsed?.users).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run test/unit/fixtures-guard.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add test/unit/fixtures-guard.test.ts
git commit -m "test: add fixtures guard unit tests"
```

---

## Chunk 9: Final Integration & Verification

### Task 17: Run Full Test Suite

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run test/unit
```

Expected: all PASS.

- [ ] **Step 2: Run all integration tests**

```bash
npx vitest run test/integration
```

Expected: all PASS.

- [ ] **Step 3: Build TypeScript**

```bash
npx tsc
```

Expected: no errors.

- [ ] **Step 4: Run CLI smoke test**

```bash
node bin/sso-mocker.js config --env development | head -5
```

Expected: prints JSON config.

- [ ] **Step 5: Docker build and smoke test**

```bash
docker build -t sso-mocker:final .
docker run -d -p 9090:9090 --name final-test sso-mocker:final
sleep 3
curl -sf http://localhost:9090/health
curl -sf http://localhost:9090/.well-known/openid-configuration | jq .issuer
curl -sf http://localhost:9090/admin/v1/users | jq length
docker stop final-test && docker rm final-test
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git status
# If there are any uncommitted changes:
git commit -m "chore: final cleanup and verification"
```

---

## Summary: Task Dependency Graph

```
Task 1 (scaffolding)
  |
  v
Task 2 (schemas) --> Task 3 (interpolation) --> Task 4 (config loader)
  |
  v
Task 5 (scopes) --> Task 6 (claims)
  |
  v
Task 7 (memory adapter)
  |
  v
Task 8 (OIDC provider + login UI + server + discovery tests)
  |
  v
Task 9 (admin API - users) --> Task 10 (admin API - roles/teams)
  |
  v
Task 11 (OIDC flow integration tests)
  |
  v
Task 12 (CLI) --> Task 13 (Docker) --> Task 14 (GitHub Actions)
  |
  v
Task 15 (Kubernetes) --> Task 16 (fixtures guard tests)
  |
  v
Task 17 (full verification)
```

**Total: 17 tasks across 9 chunks. Each task produces a working, tested, committed increment.**
