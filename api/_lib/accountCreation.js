import { randomUUID } from 'node:crypto';

export const NIK_RESERVATION_LEASE_MS = 15 * 60 * 1000;

export class AccountCreationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function validateAccountInput(body = {}) {
  if (typeof body.nik !== 'string' || !body.nik.trim()) {
    throw new AccountCreationError(400, 'INVALID_NIK', 'NIK wajib diisi.');
  }

  const nik = body.nik.trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(nik) || !/\d{4}$/.test(nik)) {
    throw new AccountCreationError(400, 'INVALID_NIK', 'NIK harus valid dan memiliki minimal 4 digit di bagian akhir.');
  }

  if (typeof body.name !== 'string' || !body.name.trim()) {
    throw new AccountCreationError(400, 'INVALID_NAME', 'Nama wajib diisi.');
  }

  if (body.role !== 'USER' && body.role !== 'ADMIN') {
    throw new AccountCreationError(400, 'INVALID_ROLE', 'Role harus USER atau ADMIN.');
  }

  return {
    nik,
    name: body.name.trim(),
    requestedRole: body.role,
    role: body.role === 'ADMIN' ? 'APP_ADMIN' : 'USER',
    email: `mine-track+${nik.toLowerCase()}@internal.local`,
    initialPassword: `${body.role === 'ADMIN' ? 'GCadmin' : 'GCuser'}${nik.slice(-4)}`,
  };
}

function duplicateError(code, message) {
  return new AccountCreationError(409, code, message);
}

async function assertNoExistingProfile(firestore, nik) {
  const variants = [...new Set([nik, nik.toLowerCase()])];
  for (const candidate of variants) {
    const snapshot = await firestore
      .collection('users')
      .where('nik', '==', candidate)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      throw duplicateError('NIK_ALREADY_REGISTERED', 'NIK sudah terdaftar.');
    }
  }
}

async function releaseReservation(firestore, reservationRef, attemptId) {
  await firestore.runTransaction(async (transaction) => {
    const reservation = await transaction.get(reservationRef);
    if (reservation.exists && reservation.data()?.attemptId === attemptId) {
      transaction.delete(reservationRef);
    }
  });
}

function timestampMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function acquireNikReservation({
  firestore,
  reservationRef,
  nik,
  actorUid,
  attemptId,
  nowMs = Date.now(),
  leaseMs = NIK_RESERVATION_LEASE_MS,
}) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reservationRef);
    const current = snapshot.exists ? snapshot.data() || {} : null;

    if (current) {
      if (current.status !== 'CREATING') {
        throw duplicateError('NIK_ALREADY_REGISTERED', 'NIK sudah terdaftar.');
      }

      const lastUpdatedAt = timestampMillis(current.updatedAt ?? current.createdAt);
      const isStale = lastUpdatedAt !== null && nowMs - lastUpdatedAt >= leaseMs;
      if (!isStale) {
        throw new AccountCreationError(409, 'ACCOUNT_CREATION_IN_PROGRESS', 'Pembuatan akun untuk NIK ini sedang diproses.');
      }
    }

    const reservation = {
      nik,
      status: 'CREATING',
      attemptId,
      requestedBy: actorUid,
      createdAt: new Date(nowMs),
      updatedAt: new Date(nowMs),
    };

    if (snapshot.exists) transaction.update(reservationRef, reservation);
    else transaction.create(reservationRef, reservation);

    return reservation;
  });
}

async function refreshReservationLease(firestore, reservationRef, attemptId, nowMs = Date.now()) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reservationRef);
    const reservation = snapshot.exists ? snapshot.data() : null;

    if (!reservation || reservation.attemptId !== attemptId || reservation.status !== 'CREATING') {
      throw new AccountCreationError(409, 'ACCOUNT_CREATION_SUPERSEDED', 'Proses pembuatan akun sudah diambil alih.');
    }

    transaction.update(reservationRef, { updatedAt: new Date(nowMs) });
  });
}

async function commitReservation(firestore, reservationRef, attemptId, account, uid, nowMs = Date.now()) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reservationRef);
    const reservation = snapshot.exists ? snapshot.data() : null;

    if (!reservation || reservation.attemptId !== attemptId || reservation.status !== 'CREATING') {
      throw new AccountCreationError(409, 'ACCOUNT_CREATION_SUPERSEDED', 'Proses pembuatan akun sudah diambil alih.');
    }

    transaction.update(reservationRef, {
      status: 'COMMITTED',
      uid,
      email: account.email,
      updatedAt: new Date(nowMs),
    });
  });
}

export async function createAccountWithAdmin({ admin, actorUid, body, now = Date.now }) {
  const account = validateAccountInput(body);
  const firestore = admin.firestore();
  const auth = admin.auth();
  const reservationRef = firestore.collection('accountNiks').doc(account.nik);
  const attemptId = randomUUID();
  let createdAuthUser = null;
  let createdProfileRef = null;
  let profileCreated = false;

  try {
    await acquireNikReservation({
      firestore,
      reservationRef,
      nik: account.nik,
      actorUid,
      attemptId,
      nowMs: now(),
    });
    await assertNoExistingProfile(firestore, account.nik);

    try {
      await auth.getUserByEmail(account.email);
      throw duplicateError('FIREBASE_EMAIL_ALREADY_EXISTS', 'Akun Firebase untuk NIK ini sudah ada.');
    } catch (error) {
      if (error instanceof AccountCreationError) throw error;
      if (error?.code !== 'auth/user-not-found') throw error;
    }

    await refreshReservationLease(firestore, reservationRef, attemptId, now());

    try {
      createdAuthUser = await auth.createUser({
        email: account.email,
        password: account.initialPassword,
        displayName: account.name,
      });
    } catch (error) {
      if (error?.code === 'auth/email-already-exists') {
        throw duplicateError('FIREBASE_EMAIL_ALREADY_EXISTS', 'Akun Firebase untuk NIK ini sudah ada.');
      }
      throw error;
    }

    await refreshReservationLease(firestore, reservationRef, attemptId, now());

    createdProfileRef = firestore.collection('users').doc(createdAuthUser.uid);
    await createdProfileRef.create({
      uid: createdAuthUser.uid,
      nik: account.nik,
      name: account.name,
      role: account.role,
      status: 'ACTIVE',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: null,
      accountCreationAttemptId: attemptId,
    });
    profileCreated = true;

    await commitReservation(firestore, reservationRef, attemptId, account, createdAuthUser.uid, now());
    await createdProfileRef.update({
      accountCreationAttemptId: admin.firestore.FieldValue.delete(),
    });

    return {
      uid: createdAuthUser.uid,
      nik: account.nik,
      name: account.name,
      role: account.requestedRole,
      initialPassword: account.initialPassword,
    };
  } catch (error) {
    const rollbackErrors = [];

    if (createdProfileRef) {
      try {
        const profileSnapshot = await createdProfileRef.get();
        const profile = profileSnapshot.exists ? profileSnapshot.data() : null;
        let reservationOwnsProfile = false;

        if (profileCreated && createdAuthUser) {
          const reservationSnapshot = await reservationRef.get();
          const reservation = reservationSnapshot.exists ? reservationSnapshot.data() : null;
          reservationOwnsProfile = reservation?.attemptId === attemptId
            && reservation?.uid === createdAuthUser.uid;
        }

        if (profile && (
          profile.accountCreationAttemptId === attemptId
          || reservationOwnsProfile
        )) {
          await createdProfileRef.delete();
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    if (createdAuthUser) {
      try {
        await auth.deleteUser(createdAuthUser.uid);
      } catch (rollbackError) {
        if (rollbackError?.code !== 'auth/user-not-found') rollbackErrors.push(rollbackError);
      }
    }

    try {
      await releaseReservation(firestore, reservationRef, attemptId);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }

    if (rollbackErrors.length) {
      throw new AccountCreationError(
        500,
        'ACCOUNT_ROLLBACK_FAILED',
        'Pembuatan akun gagal dan pembersihan sebagian gagal. Hubungi administrator sistem.'
      );
    }

    if (error instanceof AccountCreationError) throw error;
    throw new AccountCreationError(500, 'ACCOUNT_CREATE_FAILED', 'Akun gagal dibuat. Silakan coba kembali.');
  }
}

export function createAccountHandler({ getAdmin }) {
  return async function accountHandler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return response.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung.' });
    }

    const authorization = request.headers?.authorization || '';
    const tokenMatch = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!tokenMatch) {
      return response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Silakan login kembali.' });
    }

    let admin;
    try {
      admin = getAdmin();
    } catch {
      return response.status(500).json({ code: 'SERVER_ERROR', message: 'Permintaan gagal diproses.' });
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(tokenMatch[1], true);
    } catch {
      return response.status(401).json({ code: 'INVALID_TOKEN', message: 'Sesi tidak valid. Silakan login kembali.' });
    }

    let actor;
    try {
      const actorSnapshot = await admin.firestore().collection('users').doc(decodedToken.uid).get();
      actor = actorSnapshot.exists ? actorSnapshot.data() : null;
    } catch {
      return response.status(500).json({ code: 'SERVER_ERROR', message: 'Permintaan gagal diproses.' });
    }

    if (!actor || actor.status !== 'ACTIVE' || !['OWNER', 'APP_ADMIN'].includes(actor.role)) {
      return response.status(403).json({ code: 'FORBIDDEN', message: 'Anda tidak berwenang membuat akun.' });
    }

    let body = request.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return response.status(400).json({ code: 'INVALID_REQUEST', message: 'Format permintaan tidak valid.' });
      }
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return response.status(400).json({ code: 'INVALID_REQUEST', message: 'Format permintaan tidak valid.' });
    }

    if (Buffer.isBuffer(body)) {
      try {
        body = JSON.parse(body.toString('utf8'));
      } catch {
        return response.status(400).json({ code: 'INVALID_REQUEST', message: 'Format permintaan tidak valid.' });
      }
    }

    if (actor.role === 'APP_ADMIN' && body.role === 'ADMIN') {
      return response.status(403).json({ code: 'FORBIDDEN', message: 'APP_ADMIN hanya dapat membuat akun USER.' });
    }

    try {
      const result = await createAccountWithAdmin({ admin, actorUid: decodedToken.uid, body });
      return response.status(201).json({ success: true, account: result });
    } catch (error) {
      if (error instanceof AccountCreationError) {
        return response.status(error.status).json({ code: error.code, message: error.message });
      }
      return response.status(500).json({ code: 'SERVER_ERROR', message: 'Permintaan gagal diproses.' });
    }
  };
}