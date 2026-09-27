import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { getFirebaseAdmin } from './firebaseAdmin.js';
import { APP_ROLES, USER_STATUS } from './auth/authorization.js';
import { createCustomTokenForUid } from './auth/customToken.js';
import { normalizeNik, normalizeDisplayName, createAuthUserDocument, createAuthAuditEvent } from './auth/bootstrap.js';
import { AUTH_AUDIT_EVENT, AUTH_COLLECTIONS, AUTH_USER_FIELD } from './auth/firestoreSchema.js';
import { getServerEnvValue } from './config.js';

export const AUTH_BACKEND_PLATFORM = 'Firebase Cloud Functions';
export const AUTH_BACKEND_STATUS = 'phase-4-user-account-and-authentication';
export const AUTH_PHASE = 4;

function getFirebaseApiKey() {
  return getServerEnvValue('FIREBASE_API_KEY') || getServerEnvValue('VITE_FIREBASE_API_KEY') || '';
}

async function getUserRecordByNik(nik) {
  const firestore = getFirebaseAdmin().firestore();
  const snapshot = await firestore
    .collection(AUTH_COLLECTIONS.users)
    .where(AUTH_USER_FIELD.nik, '==', nik)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data();
}

async function verifyPasswordWithFirebase({ email, password }) {
  const apiKey = getFirebaseApiKey();

  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'Firebase public API key is missing. Configure FIREBASE_API_KEY or VITE_FIREBASE_API_KEY in the server environment.'
    );
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const payload = await response.json();

  if (!response.ok || payload?.error) {
    throw new HttpsError('unauthenticated', 'Authentication failed.');
  }

  return payload;
}

export async function createMineTrackUserAccount({
  nik,
  name,
  role = APP_ROLES.USER,
  password,
  status = USER_STATUS.ACTIVE,
}) {
  const normalizedNik = normalizeNik(nik);
  const normalizedName = normalizeDisplayName(name);

  if (!password || String(password).trim().length < 6) {
    throw new Error('A password of at least 6 characters is required.');
  }

  if (!Object.values(APP_ROLES).includes(role)) {
    throw new Error('Invalid role value.');
  }

  if (!Object.values(USER_STATUS).includes(status)) {
    throw new Error('Invalid status value.');
  }

  const adminSdk = getFirebaseAdmin();
  const firestore = adminSdk.firestore();
  const email = `${normalizedNik.toLowerCase()}@mine-track.local`;

  const existingUser = await getUserRecordByNik(normalizedNik);
  if (existingUser) {
    throw new Error('User account already exists.');
  }

  const firebaseUser = await adminSdk.auth().createUser({
    email,
    emailVerified: true,
    password,
    displayName: normalizedName,
  });

  const userRecord = createAuthUserDocument({
    uid: firebaseUser.uid,
    nik: normalizedNik,
    name: normalizedName,
    role,
    status,
  });

  await firestore.collection(AUTH_COLLECTIONS.users).doc(firebaseUser.uid).set(userRecord, { merge: true });

  await firestore.collection(AUTH_COLLECTIONS.audits).add(
    createAuthAuditEvent({
      event: AUTH_AUDIT_EVENT.CREATE_USER,
      actorUid: 'trusted-backend',
      actorNik: normalizedNik,
      targetUid: firebaseUser.uid,
      targetNik: normalizedNik,
      details: { createdVia: 'trusted_firebasem', role, status },
    })
  );

  return {
    uid: firebaseUser.uid,
    nik: normalizedNik,
    name: normalizedName,
    role,
    status,
  };
}

export const authenticateMineTrackUser = onCall(async (request) => {
  const { nik, password } = request.data || {};

  if (!nik || !password) {
    throw new HttpsError('invalid-argument', 'NIK and password are required.');
  }

  const normalizedNik = normalizeNik(nik);
  const userRecord = await getUserRecordByNik(normalizedNik);

  if (!userRecord) {
    throw new HttpsError('auth/user-not-found', 'Authentication failed.');
  }

  if (userRecord.status !== USER_STATUS.ACTIVE) {
    throw new HttpsError('permission-denied', 'This account is currently disabled.');
  }

  const email = `${normalizedNik.toLowerCase()}@mine-track.local`;
  const firebaseLogin = await verifyPasswordWithFirebase({ email, password });
  const uid = firebaseLogin.localId;
  const customToken = await createCustomTokenForUid(uid);

  const updateUser = await getFirebaseAdmin().firestore().collection(AUTH_COLLECTIONS.users).doc(uid).set(
    {
      [AUTH_USER_FIELD.lastLoginAt]: new Date().toISOString(),
      [AUTH_USER_FIELD.updatedAt]: new Date().toISOString(),
    },
    { merge: true }
  );

  await getFirebaseAdmin().firestore().collection(AUTH_COLLECTIONS.audits).add(
    createAuthAuditEvent({
      event: AUTH_AUDIT_EVENT.LOGIN,
      actorUid: uid,
      actorNik: normalizedNik,
      targetUid: uid,
      targetNik: normalizedNik,
      details: { loginSource: 'firebase_callable_auth' },
    })
  );

  return {
    customToken,
    user: {
      uid,
      nik: userRecord.nik,
      name: userRecord.name,
      role: userRecord.role,
      status: userRecord.status,
    },
    message: 'authenticated',
    updateUser,
  };
});

export function describeAuthBackendFoundation() {
  return {
    platform: AUTH_BACKEND_PLATFORM,
    purpose: 'Trusted server-side boundary for Firebase Admin SDK, custom tokens, role enforcement, audit events, secure owner bootstrap, user creation, and authentication checks.',
    activeEndpoints: ['createMineTrackUserAccount', 'authenticateMineTrackUser'],
    phase: AUTH_PHASE,
    notes: 'No reporting, Google Sheets, offline sync, or photo/reporting flows are touched by this foundation layer.',
  };
}

export function describeAuthPhase4Foundation() {
  return {
    phase: 4,
    model: 'Firestore auth user records, account creation validation, audit events, and server-side authentication checks.',
    userAccountFlow: 'Create trusted user records without storing plaintext password material, then validate active status and role before sign-in.',
    security: 'No plaintext password storage in Firestore; role values and status are validated server-side only.',
  };
}
