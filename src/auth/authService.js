import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, getFirestore, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';

import { firebaseApp, isFirebaseClientConfigured } from '../firebase/client.js';
import { canManageAccountAction } from './accountAuthorization.js';

export const APP_ROLES = Object.freeze({
  OWNER: 'OWNER',
  APP_ADMIN: 'APP_ADMIN',
  USER: 'USER',
});

export const USER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
});

export function normalizeNikForAuth(nik) {
  const normalized = String(nik ?? '').trim();

  if (!normalized) {
    throw new Error('NIK is required.');
  }

  return normalized.toUpperCase();
}

export function buildInternalFirebaseEmail(nik) {
  const normalizedNik = normalizeNikForAuth(nik);
  return `mine-track+${normalizedNik.toLowerCase()}@internal.local`;
}

export function sanitizeAuthUser(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const safeUser = {
    uid: String(user.uid || user.id || ''),
    nik: String(user.nik || '').trim(),
    name: String(user.name || '').trim() || 'MineTrack User',
    role: String(user.role || APP_ROLES.USER),
    status: String(user.status || USER_STATUS.ACTIVE),
  };

  if (!safeUser.uid || !safeUser.nik) {
    return null;
  }

  return safeUser;
}

export function getFirebaseAuthInstance() {
  if (!isFirebaseClientConfigured) {
    throw new Error('Firebase authentication is not configured.');
  }

  return getAuth(firebaseApp);
}

export function getFirebaseDbInstance() {
  if (!isFirebaseClientConfigured) {
    throw new Error('Firebase Firestore is not configured.');
  }

  return getFirestore(firebaseApp);
}

export async function updateManagedAccount({ actorRole, targetUid, targetRole, action, value }) {
  if (!canManageAccountAction({ actorRole, targetRole, action, value })) {
    throw new Error('You are not allowed to perform this account action.');
  }

  if (!targetUid) {
    throw new Error('Target account is invalid.');
  }

  const updates = action === 'status' ? { status: value } : { role: value };
  await updateDoc(doc(getFirebaseDbInstance(), 'users', targetUid), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function createManagedAccount({ nik, name, role }) {
  const auth = getFirebaseAuthInstance();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Sesi tidak tersedia. Silakan login kembali.');
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch('/api/admin/accounts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({ nik, name, role }),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Server memberikan respons yang tidak valid.');
  }

  if (!response.ok || result?.success !== true || !result.account) {
    throw new Error(result?.message || 'Akun gagal dibuat. Silakan coba kembali.');
  }

  return result.account;
}

export async function loadMineTrackUserProfile(uid, callSource = 'unknown') {
  if (!uid) {
    return null;
  }

  const auth = getFirebaseAuthInstance();
  const requestedUid = String(uid);
  const authCurrentUserUid = auth?.currentUser?.uid || null;

  console.info('[AUTH PROFILE READ]', {
    callSource,
    requestedUid,
    authCurrentUserUid,
    authCurrentUserNull: !auth?.currentUser,
    authCurrentUserExists: Boolean(auth?.currentUser),
    authCurrentUserMatchesRequestedUid: authCurrentUserUid === requestedUid,
    documentPath: `users/${requestedUid}`,
  });

  const db = getFirebaseDbInstance();
  const userRef = doc(db, 'users', requestedUid);

  try {
    const snapshot = await getDoc(userRef);

    console.info('[AUTH PROFILE READ RESULT]', {
      callSource,
      requestedUid,
      authCurrentUserUid,
      authCurrentUserNull: !auth?.currentUser,
      authCurrentUserMatchesRequestedUid: authCurrentUserUid === requestedUid,
      documentPath: `users/${requestedUid}`,
      result: snapshot.exists() ? 'SUCCESS' : 'NOT_FOUND',
      documentExists: snapshot.exists(),
    });

    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.data();
  } catch (error) {
    console.error('[AUTH PROFILE READ ERROR]', {
      callSource,
      requestedUid,
      authCurrentUserUid,
      authCurrentUserNull: !auth?.currentUser,
      authCurrentUserMatchesRequestedUid: authCurrentUserUid === requestedUid,
      documentPath: `users/${requestedUid}`,
      code: error?.code,
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      raw: error,
    });
    throw error;
  }
}

export function buildAuthSession(user) {
  const safeUser = sanitizeAuthUser(user);

  if (!safeUser) {
    throw new Error('User session is invalid.');
  }

  if (safeUser.status !== USER_STATUS.ACTIVE) {
    throw new Error('This account is currently disabled.');
  }

  return {
    user: safeUser,
    authenticatedAt: new Date().toISOString(),
    active: true,
  };
}

export async function loginWithNikAndPassword({ nik, password }) {
  const normalizedNik = normalizeNikForAuth(nik);
  const safePassword = String(password ?? '').trim();

  if (!safePassword) {
    throw new Error('NIK and password are required.');
  }

  if (!isFirebaseClientConfigured) {
    throw new Error('Firebase authentication is not configured.');
  }

  const auth = getFirebaseAuthInstance();
  const email = buildInternalFirebaseEmail(normalizedNik);

  const credential = await signInWithEmailAndPassword(auth, email, safePassword);
  const profile = await loadMineTrackUserProfile(credential.user.uid, 'login flow');

  if (!profile) {
    await signOut(auth);
    throw new Error('Account is not configured.');
  }

  if (profile.status !== USER_STATUS.ACTIVE) {
    await signOut(auth);
    throw new Error('This account is currently disabled.');
  }

  const safeUser = sanitizeAuthUser({
    uid: credential.user.uid,
    nik: profile.nik || normalizedNik,
    name: profile.name || credential.user.displayName || 'MineTrack User',
    role: profile.role || APP_ROLES.USER,
    status: profile.status || USER_STATUS.ACTIVE,
  });

  if (!safeUser) {
    await signOut(auth);
    throw new Error('Authentication failed.');
  }

  return {
    user: safeUser,
    firebaseUser: credential.user,
    profile,
    session: buildAuthSession(safeUser),
  };
}

export async function logoutFromFirebaseSession() {
  const auth = getFirebaseAuthInstance();
  await signOut(auth);
}

export function observeFirebaseAuthSession({ onSession, onError }) {
  if (!isFirebaseClientConfigured) {
    if (typeof onError === 'function') {
      onError('Firebase authentication is not configured.');
    }
    return () => {};
  }

  const auth = getFirebaseAuthInstance();
  let unsubscribeProfile = null;

  const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
    unsubscribeProfile?.();
    unsubscribeProfile = null;

    if (!firebaseUser) {
      onSession?.(null);
      return;
    }

    const uid = firebaseUser.uid;
    unsubscribeProfile = onSnapshot(
      doc(getFirebaseDbInstance(), 'users', uid),
      async (snapshot) => {
        if (auth.currentUser?.uid !== uid) return;

        const profile = snapshot.exists() ? snapshot.data() : null;
        if (!profile || profile.status !== USER_STATUS.ACTIVE) {
          await signOut(auth).catch(() => {});
          onSession?.(null);
          onError?.(profile ? 'This account is currently disabled.' : 'Account is not configured.');
          return;
        }

        const safeUser = sanitizeAuthUser({
          uid,
          nik: profile.nik || '',
          name: profile.name || firebaseUser.displayName || 'MineTrack User',
          role: profile.role || APP_ROLES.USER,
          status: profile.status,
        });

        if (!safeUser) {
          await signOut(auth).catch(() => {});
          onSession?.(null);
          onError?.('Authentication failed.');
          return;
        }

        onSession?.({ user: safeUser, firebaseUser, profile });
      },
      async () => {
        if (auth.currentUser?.uid !== uid) return;
        await signOut(auth).catch(() => {});
        onSession?.(null);
        onError?.('Authentication failed.');
      }
    );
  });

  return () => {
    unsubscribe();
    unsubscribeProfile?.();
  };
}
