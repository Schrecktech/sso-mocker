import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { interpolateEnvVars } from '../../src/config/interpolate.js';

describe('interpolateEnvVars', () => {
  beforeEach(() => {
    vi.stubEnv('TEST_VAR', 'hello');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

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
