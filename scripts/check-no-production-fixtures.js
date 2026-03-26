import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';

let failed = false;

if (existsSync('fixtures/production.users.yaml')) {
  console.error('ERROR: fixtures/production.users.yaml must not exist.');
  failed = true;
}

if (existsSync('config/production.users.yaml')) {
  console.error('ERROR: config/production.users.yaml must not exist.');
  failed = true;
}

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
