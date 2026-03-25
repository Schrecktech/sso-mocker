import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/loader.js';
import path from 'node:path';

const CONFIG_DIR = path.resolve('config');

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads default config', async () => {
    const result = await loadConfig({
      env: 'development',
      configDir: CONFIG_DIR,

    });
    expect(result.config.server.port).toBe(9090);
    expect(result.config.clients).toHaveLength(2);
    expect(result.config.teams).toHaveLength(2);
    expect(result.config.roles).toHaveLength(3);
  });

  it('loads user fixtures for development', async () => {
    const result = await loadConfig({
      env: 'development',
      configDir: CONFIG_DIR,

    });
    expect(result.users).toHaveLength(3);
    expect(result.users[0].id).toBe('alice');
  });

  it('merges environment overrides', async () => {
    const result = await loadConfig({
      env: 'integration',
      configDir: CONFIG_DIR,

    });
    expect(result.config.login.mode).toBe('auto');
    expect(result.config.server.issuer).toBe('http://sso-mocker:9090');
  });

  it('loads integration fixtures', async () => {
    const result = await loadConfig({
      env: 'integration',
      configDir: CONFIG_DIR,

    });
    expect(result.users.find((u) => u.id === 'test-admin')).toBeDefined();
  });

  it('rejects fixtures in production mode', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost');
    vi.stubEnv('SIGNING_KEYS_JSON', '[]');
    vi.stubEnv('ADMIN_API_KEY', 'secret');
    await expect(
      loadConfig({
        env: 'production',
        configDir: CONFIG_DIR,
  
        forceFixturesExist: true,
      }),
    ).rejects.toThrow('User fixtures are not allowed in production');
  });

  it('rejects production with no Admin API key', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost');
    vi.stubEnv('SIGNING_KEYS_JSON', '[]');
    vi.stubEnv('ADMIN_API_KEY', '');
    await expect(
      loadConfig({
        env: 'production',
        configDir: CONFIG_DIR,
  
      }),
    ).rejects.toThrow('Admin API must be secured');
  });

  it('applies CLI overrides', async () => {
    const result = await loadConfig({
      env: 'development',
      configDir: CONFIG_DIR,

      overrides: { port: 8080, loginMode: 'auto' },
    });
    expect(result.config.server.port).toBe(8080);
    expect(result.config.login.mode).toBe('auto');
  });
});
