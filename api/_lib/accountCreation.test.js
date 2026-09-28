import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  acquireNikReservation,
  AccountCreationError,
  createAccountHandler,
  createAccountWithAdmin,
  NIK_RESERVATION_LEASE_MS,
  validateAccountInput,
} from './accountCreation.js';

function createFakeAdmin({ existingUsers = [], existingEmails = [], failProfile = false, failAuthDelete = false } = {}) {
  const users = new Map(existingUsers.map((user) => [user.uid, user]));
  const reservations = new Map();
  const authUsers = new Map(existingEmails.map((email) => [email, { uid: `existing-${email}` }]));
  let nextUid = 0;
  let transactionTail = Promise.resolve();

  const makeRef = (collectionName, id) => ({
    collectionName,
    id,
    async get() {
      const source = collectionName === 'users' ? users : reservations;
      const data = source.get(id);
      return { exists: Boolean(data), data: () => data };
    },
    async create(value) {
      if (collectionName === 'users' && failProfile) throw new Error('profile write failed');
      const source = collectionName === 'users' ? users : reservations;
      if (source.has(id)) {
        const error = new Error('exists');
        error.code = 'already-exists';
        throw error;
      }
      source.set(id, value);
    },
    async update(value) {
      const source = collectionName === 'users' ? users : reservations;
      const updated = { ...source.get(id) };
      Object.entries(value).forEach(([key, fieldValue]) => {
        if (fieldValue === '__DELETE_FIELD__') delete updated[key];
        else updated[key] = fieldValue;
      });
      source.set(id, updated);
    },
    async delete() {
      (collectionName === 'users' ? users : reservations).delete(id);
    },
  });

  const firestore = () => ({
    collection(name) {
      return {
        doc: (id) => makeRef(name, id),
        where(field, operator, value) {
          return {
            limit() {
              return {
                async get() {
                  const matches = [...users.values()].filter((user) => user[field] === value);
                  return { empty: matches.length === 0 };
                },
              };
            },
          };
        },
      };
    },
    async runTransaction(callback) {
      let unlock;
      const previousTransaction = transactionTail;
      transactionTail = new Promise((resolve) => { unlock = resolve; });
      await previousTransaction;

      const writes = [];
      const transaction = {
        async get(ref) {
          const source = ref.collectionName === 'users' ? users : reservations;
          const data = source.get(ref.id);
          return { exists: Boolean(data), data: () => data };
        },
        create(ref, value) { writes.push({ type: 'create', ref, value }); },
        update(ref, value) { writes.push({ type: 'update', ref, value }); },
        delete(ref) { writes.push({ type: 'delete', ref }); },
      };

      try {
        const result = await callback(transaction);
        for (const write of writes) {
          const source = write.ref.collectionName === 'users' ? users : reservations;
          if (write.type === 'create') {
            if (source.has(write.ref.id)) throw new Error('transaction document exists');
            source.set(write.ref.id, write.value);
          } else if (write.type === 'update') {
            const current = source.get(write.ref.id);
            if (!current) throw new Error('transaction document missing');
            source.set(write.ref.id, { ...current, ...write.value });
          } else {
            source.delete(write.ref.id);
          }
        }
        return result;
      } finally {
        unlock();
      }
    },
  });

  firestore.FieldValue = {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    delete: () => '__DELETE_FIELD__',
  };

  const auth = () => ({
    async verifyIdToken(token) {
      if (token !== 'valid') throw new Error('invalid token');
      return { uid: 'actor-1' };
    },
    async getUserByEmail(email) {
      if (authUsers.has(email)) return authUsers.get(email);
      const error = new Error('not found');
      error.code = 'auth/user-not-found';
      throw error;
    },
    async createUser(record) {
      if ([...authUsers.keys()].includes(record.email)) {
        const error = new Error('duplicate email');
        error.code = 'auth/email-already-exists';
        throw error;
      }
      const user = { ...record, uid: `created-${++nextUid}` };
      authUsers.set(record.email, user);
      return user;
    },
    async deleteUser(uid) {
      if (failAuthDelete) throw new Error('delete failed');
      for (const [email, user] of authUsers) {
        if (user.uid === uid) authUsers.delete(email);
      }
    },
  });

  return {
    firestore,
    auth,
    state: { users, reservations, authUsers },
  };
}

function createResponse() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function makeHandlerRequest({ token = 'valid', body = { nik: '32601111', name: 'Operator', role: 'USER' } } = {}) {
  return { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body };
}

function assertPasswordFormat(password, role, nik) {
  const prefix = role === 'ADMIN' ? 'GCadmin' : 'GCuser';
  assert.equal(password.slice(0, prefix.length), prefix);
  assert.equal(password.slice(-4), nik.slice(-4));
  assert.equal(password.length, prefix.length + 4);
}

test('password formats, role mapping, and leading-zero suffix are exact', () => {
  assertPasswordFormat(validateAccountInput({ nik: ' 32601111 ', name: ' A ', role: 'USER' }).initialPassword, 'USER', '32601111');
  assertPasswordFormat(validateAccountInput({ nik: '32601801', name: 'Admin', role: 'ADMIN' }).initialPassword, 'ADMIN', '32601801');
  assertPasswordFormat(validateAccountInput({ nik: '32600025', name: 'User', role: 'USER' }).initialPassword, 'USER', '32600025');
  assertPasswordFormat(validateAccountInput({ nik: '32600025', name: 'Admin', role: 'ADMIN' }).initialPassword, 'ADMIN', '32600025');
  assert.equal(validateAccountInput({ nik: '32601801', name: 'Admin', role: 'ADMIN' }).role, 'APP_ADMIN');
});

test('invalid NIK, empty name, and invalid role are rejected', () => {
  assert.throws(() => validateAccountInput({ nik: ' ', name: 'A', role: 'USER' }), /NIK wajib/);
  assert.throws(() => validateAccountInput({ nik: 'AB12', name: 'A', role: 'USER' }), /NIK harus valid/);
  assert.throws(() => validateAccountInput({ nik: '12345678', name: ' ', role: 'USER' }), /Nama wajib/);
  assert.throws(() => validateAccountInput({ nik: '12345678', name: 'A', role: 'OWNER' }), /Role harus/);
});

test('CREATING reservation yang belum stale ditolak tanpa mengambil alih pemilik aktif', async () => {
  const admin = createFakeAdmin();
  const firestore = admin.firestore();
  const nowMs = Date.now();
  const reservationRef = firestore.collection('accountNiks').doc('32601111');
  admin.state.reservations.set('32601111', {
    nik: '32601111',
    status: 'CREATING',
    attemptId: 'active-attempt',
    createdAt: new Date(nowMs - 1000),
    updatedAt: new Date(nowMs - 1000),
  });

  await assert.rejects(
    () => acquireNikReservation({
      firestore,
      reservationRef,
      nik: '32601111',
      actorUid: 'owner',
      attemptId: 'new-attempt',
      nowMs,
    }),
    (error) => error instanceof AccountCreationError
      && error.code === 'ACCOUNT_CREATION_IN_PROGRESS'
  );
  assert.equal(admin.state.reservations.get('32601111').attemptId, 'active-attempt');
});

test('CREATING reservation stale dapat diambil alih dengan attemptId dan lease baru', async () => {
  const admin = createFakeAdmin();
  const firestore = admin.firestore();
  const nowMs = Date.now();
  const reservationRef = firestore.collection('accountNiks').doc('32601111');
  const staleAt = new Date(nowMs - NIK_RESERVATION_LEASE_MS - 1);
  admin.state.reservations.set('32601111', {
    nik: '32601111',
    status: 'CREATING',
    attemptId: 'crashed-attempt',
    createdAt: staleAt,
    updatedAt: staleAt,
  });

  const acquired = await acquireNikReservation({
    firestore,
    reservationRef,
    nik: '32601111',
    actorUid: 'owner',
    attemptId: 'takeover-attempt',
    nowMs,
  });

  assert.equal(acquired.status, 'CREATING');
  assert.equal(admin.state.reservations.get('32601111').attemptId, 'takeover-attempt');
  assert.equal(admin.state.reservations.get('32601111').updatedAt.getTime(), nowMs);
});

test('dua request bersamaan hanya satu yang memperoleh reservation', async () => {
  const admin = createFakeAdmin();
  const firestore = admin.firestore();
  const reservationRef = firestore.collection('accountNiks').doc('32601111');
  const results = await Promise.allSettled([
    acquireNikReservation({ firestore, reservationRef, nik: '32601111', actorUid: 'owner-a', attemptId: 'attempt-a' }),
    acquireNikReservation({ firestore, reservationRef, nik: '32601111', actorUid: 'owner-b', attemptId: 'attempt-b' }),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(admin.state.reservations.get('32601111').status, 'CREATING');
});

test('OWNER dapat membuat USER dan ADMIN dengan email login NIK aktif', async () => {
  const admin = createFakeAdmin();
  for (const role of ['USER', 'ADMIN']) {
    const result = await createAccountWithAdmin({
      admin,
      actorUid: 'owner-1',
      body: { nik: role === 'USER' ? '32601111' : '32601801', name: 'Operator', role },
    });
    assert.equal(result.role, role);
    assert.equal(admin.state.users.get(result.uid).role, role === 'ADMIN' ? 'APP_ADMIN' : 'USER');
    assert.equal(admin.state.authUsers.has(`mine-track+${result.nik.toLowerCase()}@internal.local`), true);
    assert.equal(admin.state.reservations.get(result.nik).status, 'COMMITTED');
  }
});

test('duplicate profile NIK and duplicate Firebase email are rejected', async () => {
  const existingProfileAdmin = createFakeAdmin({ existingUsers: [{ uid: 'old', nik: '32601111' }] });
  await assert.rejects(
    () => createAccountWithAdmin({ admin: existingProfileAdmin, actorUid: 'owner', body: { nik: '32601111', name: 'N', role: 'USER' } }),
    (error) => error instanceof AccountCreationError && error.code === 'NIK_ALREADY_REGISTERED'
  );

  const email = 'mine-track+32601111@internal.local';
  const existingEmailAdmin = createFakeAdmin({ existingEmails: [email] });
  await assert.rejects(
    () => createAccountWithAdmin({ admin: existingEmailAdmin, actorUid: 'owner', body: { nik: '32601111', name: 'N', role: 'USER' } }),
    (error) => error instanceof AccountCreationError && error.code === 'FIREBASE_EMAIL_ALREADY_EXISTS'
  );
  assert.equal(existingEmailAdmin.state.reservations.size, 0);
});

test('Firestore profile failure rolls back Firebase Auth and NIK reservation without returning password', async () => {
  const admin = createFakeAdmin({ failProfile: true });
  await assert.rejects(
    () => createAccountWithAdmin({ admin, actorUid: 'owner', body: { nik: '32601111', name: 'N', role: 'USER' } }),
    (error) => error instanceof AccountCreationError && error.code === 'ACCOUNT_CREATE_FAILED'
  );
  assert.equal(admin.state.authUsers.size, 0);
  assert.equal(admin.state.reservations.size, 0);
});

test('rollback tidak menghapus profile lama jika UID kebetulan sudah mempunyai dokumen', async () => {
  const existingProfile = { uid: 'created-1', nik: 'OLD12345', name: 'Existing', role: 'USER', status: 'ACTIVE' };
  const admin = createFakeAdmin({ existingUsers: [existingProfile], failProfile: false });
  await assert.rejects(
    () => createAccountWithAdmin({ admin, actorUid: 'owner', body: { nik: '32601111', name: 'N', role: 'USER' } }),
    (error) => error instanceof AccountCreationError && error.code === 'ACCOUNT_CREATE_FAILED'
  );
  assert.deepEqual(admin.state.users.get('created-1'), existingProfile);
  assert.equal(admin.state.authUsers.size, 0);
});

test('failed rollback is reported and never includes a password', async () => {
  const admin = createFakeAdmin({ failProfile: true, failAuthDelete: true });
  await assert.rejects(
    () => createAccountWithAdmin({ admin, actorUid: 'owner', body: { nik: '32601111', name: 'N', role: 'USER' } }),
    (error) => error instanceof AccountCreationError
      && error.code === 'ACCOUNT_ROLLBACK_FAILED'
      && !error.message.includes('GCuser')
  );
  assert.equal(admin.state.reservations.size, 0);
});

test('handler returns 401 without token and 403 for USER, disabled actor, or APP_ADMIN creating ADMIN', async () => {
  const emptyAdmin = createFakeAdmin();
  const noTokenResponse = createResponse();
  await createAccountHandler({ getAdmin: () => emptyAdmin })(makeHandlerRequest({ token: '' }), noTokenResponse);
  assert.equal(noTokenResponse.statusCode, 401);
  assert.equal(noTokenResponse.headers['Cache-Control'], 'no-store');

  const invalidTokenResponse = createResponse();
  await createAccountHandler({ getAdmin: () => emptyAdmin })(makeHandlerRequest({ token: 'invalid' }), invalidTokenResponse);
  assert.equal(invalidTokenResponse.statusCode, 401);

  const userAdmin = createFakeAdmin();
  userAdmin.state.users.set('actor-1', { uid: 'actor-1', role: 'USER', status: 'ACTIVE' });
  const userResponse = createResponse();
  await createAccountHandler({ getAdmin: () => userAdmin })(makeHandlerRequest({
    body: { nik: '32601111', name: 'Operator', role: 'USER', actorRole: 'OWNER', uid: 'owner-uid' },
  }), userResponse);
  assert.equal(userResponse.statusCode, 403);

  const disabledAdmin = createFakeAdmin();
  disabledAdmin.state.users.set('actor-1', { uid: 'actor-1', role: 'OWNER', status: 'DISABLED' });
  const disabledResponse = createResponse();
  await createAccountHandler({ getAdmin: () => disabledAdmin })(makeHandlerRequest(), disabledResponse);
  assert.equal(disabledResponse.statusCode, 403);

  const adminActor = createFakeAdmin();
  adminActor.state.users.set('actor-1', { uid: 'actor-1', role: 'APP_ADMIN', status: 'ACTIVE' });
  const adminResponse = createResponse();
  await createAccountHandler({ getAdmin: () => adminActor })(makeHandlerRequest({ body: { nik: '32601801', name: 'Admin', role: 'ADMIN' } }), adminResponse);
  assert.equal(adminResponse.statusCode, 403);

  const adminUserResponse = createResponse();
  await createAccountHandler({ getAdmin: () => adminActor })(makeHandlerRequest({ body: { nik: '32601112', name: 'User', role: 'USER' } }), adminUserResponse);
  assert.equal(adminUserResponse.statusCode, 201);

  const disabledAdminActor = createFakeAdmin();
  disabledAdminActor.state.users.set('actor-1', { uid: 'actor-1', role: 'APP_ADMIN', status: 'DISABLED' });
  const disabledAdminResponse = createResponse();
  await createAccountHandler({ getAdmin: () => disabledAdminActor })(makeHandlerRequest(), disabledAdminResponse);
  assert.equal(disabledAdminResponse.statusCode, 403);
});

test('HTTP endpoint mengizinkan OWNER membuat USER dan ADMIN', async () => {
  const admin = createFakeAdmin();
  admin.state.users.set('actor-1', { uid: 'actor-1', role: 'OWNER', status: 'ACTIVE' });
  const handler = createAccountHandler({ getAdmin: () => admin });

  for (const [nik, role, expectedRole] of [
    ['32601111', 'USER', 'USER'],
    ['32601801', 'ADMIN', 'APP_ADMIN'],
  ]) {
    const response = createResponse();
    await handler(makeHandlerRequest({ body: { nik, name: 'Operator', role } }), response);
    assert.equal(response.statusCode, 201);
    assert.equal(admin.state.users.get(response.payload.account.uid).role, expectedRole);
  }
});

test('successful handler returns password only in no-store response', async () => {
  const admin = createFakeAdmin();
  admin.state.users.set('actor-1', { uid: 'actor-1', role: 'OWNER', status: 'ACTIVE' });
  const response = createResponse();
  await createAccountHandler({ getAdmin: () => admin })(makeHandlerRequest(), response);

  assert.equal(response.statusCode, 201);
  const returnedPassword = response.payload.account.initialPassword;
  assertPasswordFormat(returnedPassword, 'USER', '32601111');
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal([...admin.state.users.values()].some((user) => Object.values(user).includes(returnedPassword)), false);
  assert.equal([...admin.state.reservations.values()].some((reservation) => Object.values(reservation).includes(returnedPassword)), false);
  assert.equal('accountCreationAttemptId' in admin.state.users.get(response.payload.account.uid), false);
});

test('server account handler tidak memanggil logger yang dapat mencatat password', () => {
  const source = readFileSync(new URL('./accountCreation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.(log|info|warn|error)\s*\(/);
});

test('HTTP response partial failure tidak memuat password awal', async () => {
  const admin = createFakeAdmin({ failProfile: true, failAuthDelete: true });
  admin.state.users.set('actor-1', { uid: 'actor-1', role: 'OWNER', status: 'ACTIVE' });
  const response = createResponse();
  await createAccountHandler({ getAdmin: () => admin })(makeHandlerRequest(), response);

  assert.equal(response.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(response.payload), /GCuser|GCadmin|initialPassword/);
});