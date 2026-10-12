import { generateKeyPair, exportPKCS8, exportJWK } from 'jose';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Development-only bootstrap. Values are passed through stdin, never arguments or files.
const deployment = 'third-bandicoot-18';
const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
if (!envFile.includes(`CONVEX_DEPLOYMENT=dev:${deployment}`)) throw new Error('Unexpected development target.');
const cli = new URL('../node_modules/convex/bin/main.js', import.meta.url);
const run = (args, input) => spawnSync(process.execPath, [fileURLToPath(cli), ...args, '--deployment', deployment], { input, encoding: 'utf8', windowsHide: true });
for (const name of ['JWT_PRIVATE_KEY', 'JWKS']) {
  const existing = run(['env', 'get', name]);
  if (existing.status !== 0) throw new Error(`Could not inspect ${name}; no changes made.`);
  if (existing.stdout.trim()) throw new Error(`${name} already exists; refusing to rotate authentication keys.`);
}
const keys = await generateKeyPair('RS256', { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, ' ');
const publicKey = await exportJWK(keys.publicKey);
for (const [name, value] of Object.entries({ JWT_PRIVATE_KEY: privateKey, JWKS: JSON.stringify({ keys: [{ use: 'sig', ...publicKey }] }), SITE_URL: 'http://localhost:5173' })) {
  const result = run(['env', 'set', name], value);
  if (result.status !== 0) throw new Error(`Could not set ${name}. Output suppressed to protect credentials.`);
  console.log(`Configured ${name} on development deployment ${deployment}.`);
}
