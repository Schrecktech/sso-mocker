import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { User } from '../config/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = readFileSync(path.join(__dirname, 'templates', 'login.html'), 'utf-8');

export function renderLoginPage(users: User[], action: string, clientId: string, scopes: string): string {
  const userList = users
    .map((u, i) => `
      <li class="user-item" data-testid="user-${escapeHtml(u.id)}">
        <label>
          <input type="radio" name="user" value="${escapeHtml(u.id)}" ${i === 0 ? 'checked' : ''}>
          <span class="user-name">${escapeHtml(u.name)}</span>
          <div class="user-meta">${escapeHtml(u.role)} &middot; ${u.teams.map(t => escapeHtml(t)).join(', ') || 'no teams'}</div>
        </label>
      </li>`)
    .join('\n');

  return template
    .replace('{{action}}', escapeHtml(action))
    .replace('{{userList}}', userList)
    .replace('{{clientId}}', escapeHtml(clientId))
    .replace('{{scopes}}', escapeHtml(scopes));
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
