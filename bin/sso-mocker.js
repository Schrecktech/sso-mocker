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
  const configDir = getFlag('--config');

  const mocker = await createMocker({ env, port, loginMode, configDir });
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
  const configDir = getFlag('--config');
  const mocker = await createMocker({ env, port: 0, configDir });
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
  console.log('  --config <path>       Config directory (default: ./config)');
}
