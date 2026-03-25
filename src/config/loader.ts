import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AppConfigSchema, UserSchema, type AppConfig, type User } from './schema.js';
import { interpolateEnvVars } from './interpolate.js';

export interface LoadConfigOptions {
  env: string;
  configDir: string;
  fixturesDir?: string;
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

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
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

function safeInterpolate(obj: unknown): unknown {
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

export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const { env, configDir, overrides } = options;
  const fixturesDir = options.fixturesDir ?? configDir;

  // 1. Load default.yaml
  const defaultConfig = await readYamlFile(path.join(configDir, 'default.yaml'));

  // 2. Load {env}.yaml and merge
  const envConfig = await readYamlFile(path.join(configDir, `${env}.yaml`));
  let merged = deepMerge(defaultConfig, envConfig);

  // 3. Interpolate env vars
  try {
    merged = interpolateEnvVars(merged) as Record<string, unknown>;
  } catch {
    if (env === 'staging' || env === 'production') throw new Error(`Environment variable interpolation failed for ${env} config. Ensure all required env vars are set.`);
    // For dev/integration, silently skip missing env vars
    merged = safeInterpolate(merged) as Record<string, unknown>;
  }

  // 4. Apply CLI overrides
  if (overrides?.port !== undefined) {
    (merged as Record<string, unknown>).server = {
      ...((merged as Record<string, unknown>).server as Record<string, unknown>),
      port: overrides.port,
    };
  }
  if (overrides?.loginMode !== undefined) {
    (merged as Record<string, unknown>).login = {
      ...((merged as Record<string, unknown>).login as Record<string, unknown>),
      mode: overrides.loginMode,
    };
  }

  // 5. Validate with Zod
  const config = AppConfigSchema.parse(merged);

  // 6. Load fixtures
  let users: User[] = [];
  const fixturesFile = path.join(fixturesDir, `${env}.users.yaml`);
  const fixturesExist = existsSync(fixturesFile) || options.forceFixturesExist;

  if (env === 'production' && fixturesExist) {
    throw new Error(
      'User fixtures are not allowed in production environment. Create users via the Admin API instead.',
    );
  }

  if (env === 'production') {
    if (config.admin.enabled && !config.admin.apiKey) {
      throw new Error('Admin API must be secured with an API key in production mode.');
    }
  }

  if (fixturesExist && existsSync(fixturesFile)) {
    const fixturesData = await readYamlFile(fixturesFile);
    const rawUsers = (fixturesData as Record<string, unknown>).users ?? [];
    users = (rawUsers as unknown[]).map((u: unknown) => UserSchema.parse(u));

    if (env === 'staging') {
      console.warn('[sso-mocker] Warning: User fixtures loaded in staging environment.');
    }
  }

  return { config, users, environment: env };
}
