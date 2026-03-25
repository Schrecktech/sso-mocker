import { createMocker, type MockerInstance } from '../../src/server.js';
import path from 'node:path';

export async function startTestMocker(overrides: Record<string, unknown> = {}): Promise<MockerInstance> {
  const mocker = await createMocker({
    env: 'integration',
    port: 0,
    loginMode: 'auto',
    autoLoginUser: 'alice',
    configDir: path.resolve('config'),
    ...overrides,
  } as any);
  await mocker.start();
  return mocker;
}
