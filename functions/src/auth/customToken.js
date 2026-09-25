import { getFirebaseAdmin } from '../firebaseAdmin.js';

export async function createCustomTokenForUid(uid) {
  const firebaseAdmin = getFirebaseAdmin();
  return firebaseAdmin.auth().createCustomToken(uid);
}

export async function verifyCustomToken(token) {
  const firebaseAdmin = getFirebaseAdmin();
  return firebaseAdmin.auth().verifyIdToken(token);
}
