import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

describe('fixtures guard', () => {
  it('fixtures/production.users.yaml does not exist', () => {
    expect(existsSync('fixtures/production.users.yaml')).toBe(false);
  });
  it('config/production.users.yaml does not exist', () => {
    expect(existsSync('config/production.users.yaml')).toBe(false);
  });
  it('production.yaml has no users field', () => {
    const content = readFileSync('config/production.yaml', 'utf-8');
    const parsed = parse(content);
    expect(parsed?.users).toBeUndefined();
  });
});
