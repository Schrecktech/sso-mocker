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

  afterAll(async () => {
    await mocker.stop();
  });

  it('issues access_token with client scopes', async () => {
    const { status, body } = await performClientCredentials(
      tokenEndpoint,
      'my-backend',
      'backend-secret',
      'read:users',
    );
    expect(status).toBe(200);
    expect(body.access_token).toBeDefined();
  });

  it('rejects invalid client_secret', async () => {
    const { status } = await performClientCredentials(
      tokenEndpoint,
      'my-backend',
      'wrong-secret',
    );
    expect(status).toBe(401);
  });

  it('rejects unknown client_id', async () => {
    const { status } = await performClientCredentials(
      tokenEndpoint,
      'unknown',
      'secret',
    );
    expect(status).toBe(401);
  });
});
