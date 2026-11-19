import fs from 'fs';
import path from 'path';

// Load .env.local for integration tests (vitest does not load it by itself).
const p = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(p)) {
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

export const PASSWORD = 'Passw0rd!123';
