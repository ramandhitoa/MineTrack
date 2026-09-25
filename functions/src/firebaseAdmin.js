import admin from 'firebase-admin';
import { assertServerEnv, getServerEnvValue } from './config.js';

export function initializeFirebaseAdmin() {
  if (admin.apps.length) {
    return admin;
  }

  const summary = assertServerEnv();
  const privateKey = getServerEnvValue('FIREBASE_PRIVATE_KEY');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: summary.projectId,
      clientEmail: getServerEnvValue('FIREBASE_CLIENT_EMAIL'),
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
    projectId: summary.projectId,
  });

  return admin;
}

export function getFirebaseAdmin() {
  return initializeFirebaseAdmin();
}
