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

  it('lists endpoints in discovery', async () => {
    const res = await fetch(`${mocker.issuer}/.well-known/openid-configuration`);
    const body = await res.json();
    expect(body.authorization_endpoint).toBeDefined();
    expect(body.token_endpoint).toBeDefined();
    expect(body.jwks_uri).toBeDefined();
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
