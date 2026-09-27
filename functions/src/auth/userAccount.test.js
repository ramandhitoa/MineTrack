import test from 'node:test';
import assert from 'node:assert/strict';

import { APP_ROLES, USER_STATUS } from './authorization.js';
import { authenticateUserByNik, createUserAccount } from './userAccount.js';

test('createUserAccount stores only safe role metadata and not plaintext password', () => {
  const created = createUserAccount({
    uid: 'user-101',
    nik: 'NIK-101',
    name: 'Operator 101',
    role: APP_ROLES.USER,
    status: USER_STATUS.ACTIVE,
    password: 's3cret-password',
  });

  assert.equal(created.uid, 'user-101');
  assert.equal(created.nik, 'NIK-101');
  assert.equal(created.role, APP_ROLES.USER);
  assert.equal(created.status, USER_STATUS.ACTIVE);
  assert.ok(!('password' in created));
  assert.ok(!('passwordHash' in created));
});

test('createUserAccount rejects invalid role and status values', () => {
  assert.throws(() => createUserAccount({
    uid: 'user-102',
    nik: 'NIK-102',
    name: 'Invalid Role',
    role: 'GUEST',
    status: USER_STATUS.ACTIVE,
  }), /Invalid role value/i);

  assert.throws(() => createUserAccount({
    uid: 'user-103',
    nik: 'NIK-103',
    name: 'Invalid Status',
    role: APP_ROLES.USER,
    status: 'BANNED',
  }), /Invalid status value/i);
});

test('authenticateUserByNik blocks disabled accounts', async () => {
  const adapter = {
    async findUserByNik(nik) {
      return {
        uid: 'user-104',
        nik,
        role: APP_ROLES.USER,
        status: USER_STATUS.DISABLED,
        name: 'Disabled Operator',
      };
    },
    async verifyPassword() {
      return true;
    },
  };

  await assert.rejects(
    () => authenticateUserByNik({ nik: 'NIK-104', password: 'ignored', adapter }),
    /disabled/i
  );
});

test('authenticateUserByNik returns a normalized auth session for an active user', async () => {
  const adapter = {
    async findUserByNik(nik) {
      return {
        uid: 'user-105',
        nik,
        role: APP_ROLES.APP_ADMIN,
        status: USER_STATUS.ACTIVE,
        name: 'Supervisor',
      };
    },
    async verifyPassword() {
      return true;
    },
  };

  const result = await authenticateUserByNik({ nik: 'NIK-105', password: 'valid-password', adapter });

  assert.equal(result.session.user.role, APP_ROLES.APP_ADMIN);
  assert.equal(result.session.user.status, USER_STATUS.ACTIVE);
  assert.ok(!('password' in result.session.user));
  assert.equal(result.session.user.nik, 'NIK-105');
});
