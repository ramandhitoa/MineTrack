import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canManageAccountAction } from './accountAuthorization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const authSource = readFileSync(resolve(__dirname, './authService.js'), 'utf8');

test('Firebase internal email canonicalization lowercases the NIK while preserving app normalization', () => {
  assert.match(authSource, /return normalized\.toUpperCase\(\);/);
  assert.match(authSource, /toLowerCase\(\).*@internal\.local|@internal\.local.*toLowerCase\(\)/);
  assert.match(authSource, /mine-track\+\$\{normalizedNik\.toLowerCase\(\)\}@internal\.local/);
});

test('OWNER dapat mengubah status USER dan APP_ADMIN serta role di antara keduanya', () => {
  for (const targetRole of ['USER', 'APP_ADMIN']) {
    assert.equal(canManageAccountAction({
      actorRole: 'OWNER', targetRole, action: 'status', value: 'DISABLED',
    }), true);
    assert.equal(canManageAccountAction({
      actorRole: 'OWNER', targetRole, action: 'status', value: 'ACTIVE',
    }), true);
    assert.equal(canManageAccountAction({
      actorRole: 'OWNER', targetRole, action: 'role', value: targetRole === 'USER' ? 'APP_ADMIN' : 'USER',
    }), true);
  }
});

test('OWNER account cannot be changed and roles outside USER/APP_ADMIN are rejected', () => {
  assert.equal(canManageAccountAction({
    actorRole: 'OWNER', targetRole: 'OWNER', action: 'status', value: 'DISABLED',
  }), false);
  assert.equal(canManageAccountAction({
    actorRole: 'OWNER', targetRole: 'OWNER', action: 'role', value: 'USER',
  }), false);
  assert.equal(canManageAccountAction({
    actorRole: 'OWNER', targetRole: 'USER', action: 'role', value: 'OWNER',
  }), false);
});

test('APP_ADMIN hanya dapat mengubah status USER dan tidak dapat mengubah role', () => {
  for (const value of ['ACTIVE', 'DISABLED']) {
    assert.equal(canManageAccountAction({
      actorRole: 'APP_ADMIN', targetRole: 'USER', action: 'status', value,
    }), true);
  }

  assert.equal(canManageAccountAction({
    actorRole: 'APP_ADMIN', targetRole: 'APP_ADMIN', action: 'status', value: 'DISABLED',
  }), false);
  assert.equal(canManageAccountAction({
    actorRole: 'APP_ADMIN', targetRole: 'USER', action: 'role', value: 'APP_ADMIN',
  }), false);
});

test('USER tidak dapat menjalankan operasi administrasi langsung', () => {
  assert.equal(canManageAccountAction({
    actorRole: 'USER', targetRole: 'USER', action: 'status', value: 'DISABLED',
  }), false);
  assert.equal(canManageAccountAction({
    actorRole: 'USER', targetRole: 'APP_ADMIN', action: 'role', value: 'USER',
  }), false);
});
