import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { APP_ROLES, USER_STATUS } from './authorization.js';
import {
  assertOwnerBootstrapAllowed,
  assertRoleChangeAllowed,
  assertUserIsActive,
  buildOwnerBootstrapRecord,
  createAuthAuditEvent,
  createAuthUserDocument,
  normalizeNik,
} from './bootstrap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const clientFilePath = resolve(__dirname, '../../../src/firebase/client.js');
const clientSource = readFileSync(clientFilePath, 'utf8');

test('owner bootstrap record is created without password material', () => {
  const record = buildOwnerBootstrapRecord({
    email: 'owner@mine-track.local',
    nik: 'NIK-001',
    name: 'Owner User',
    uid: 'owner-001',
  });

  assert.equal(record.ownerRecord.role, APP_ROLES.OWNER);
  assert.equal(record.ownerRecord.status, USER_STATUS.ACTIVE);
  assert.equal(record.ownerRecord.nik, 'NIK-001');
  assert.equal(record.ownerRecord.name, 'Owner User');
  assert.ok(!('password' in record.ownerRecord));
  assert.ok(!('passwordHash' in record.ownerRecord));
});

test('repeated owner bootstrap is blocked', () => {
  assert.throws(() => {
    assertOwnerBootstrapAllowed({
      actorRole: APP_ROLES.OWNER,
      ownerExists: true,
      bootstrapStatus: 'COMPLETE',
    });
  }, /already locked|already completed/i);
});

test('normal user cannot create or promote owner', () => {
  assert.throws(() => {
    assertRoleChangeAllowed({
      actorRole: APP_ROLES.USER,
      targetRole: APP_ROLES.OWNER,
      action: 'owner-create',
    });
  }, /cannot change roles|Authentication required/i);
});

test('app admin cannot promote to app admin or owner', () => {
  assert.throws(() => {
    assertRoleChangeAllowed({
      actorRole: APP_ROLES.APP_ADMIN,
      targetRole: APP_ROLES.APP_ADMIN,
      action: 'role-change',
    });
  }, /APP_ADMIN cannot manage/i);
});

test('disabled user is rejected', () => {
  const disabledUser = createAuthUserDocument({
    uid: 'u-2',
    nik: 'NIK-002',
    name: 'Disabled User',
    role: APP_ROLES.USER,
    status: USER_STATUS.DISABLED,
  });

  assert.throws(() => assertUserIsActive(disabledUser), /disabled/i);
});

test('audit event strips password material from payload', () => {
  const event = createAuthAuditEvent({
    event: 'LOGIN_FAILED',
    actorUid: 'u-1',
    actorNik: 'NIK-001',
    targetUid: 'u-2',
    targetNik: 'NIK-002',
    details: { password: 'plaintext', passwordHash: 'hash', note: 'bad password' },
  });

  assert.ok(!('password' in event.details));
  assert.ok(!('passwordHash' in event.details));
  assert.equal(event.details.note, 'bad password');
});

test('NIK validation rejects invalid format', () => {
  assert.throws(() => normalizeNik('NIK@BAD'), /invalid characters/i);
});

test('client file does not import firebase-admin into browser code', () => {
  assert.ok(!clientSource.includes('firebase-admin'));
  assert.ok(clientSource.includes('firebase/app'));
});
