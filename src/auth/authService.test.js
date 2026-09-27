import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const authSource = readFileSync(resolve(__dirname, './authService.js'), 'utf8');

test('Firebase internal email canonicalization lowercases the NIK while preserving app normalization', () => {
  assert.match(authSource, /return normalized\.toUpperCase\(\);/);
  assert.match(authSource, /toLowerCase\(\).*@internal\.local|@internal\.local.*toLowerCase\(\)/);
  assert.match(authSource, /mine-track\+\$\{normalizedNik\.toLowerCase\(\)\}@internal\.local/);
});
