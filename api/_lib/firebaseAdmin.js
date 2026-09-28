import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

let adminInstance;

function getEnvironment() {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const rawPrivateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').trim();
  const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

  return {
    projectId,
    clientEmail,
    privateKey,
    diagnostic: {
      hasProjectId: Boolean(projectId),
      hasClientEmail: Boolean(clientEmail),
      hasPrivateKey: Boolean(rawPrivateKey),
      privateKeyStartsCorrectly: /^-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(privateKey),
      privateKeyContainsNewline: privateKey.includes('\n'),
    },
  };
}

function reportInitializationFailure(diagnostic, error) {
  console.error('[ACCOUNT_API_FIREBASE_ADMIN_INIT_FAILED]', {
    ...diagnostic,
    errorName: typeof error?.name === 'string' ? error.name : 'unknown',
    errorCode: typeof error?.code === 'string' ? error.code : 'unknown',
  });
}

export function getFirebaseAdmin() {
  if (adminInstance) return adminInstance;

  const { projectId, clientEmail, privateKey, diagnostic } = getEnvironment();
  console.info('[ACCOUNT_API_FIREBASE_ADMIN_ENV]', diagnostic);

  if (!diagnostic.hasProjectId || !diagnostic.hasClientEmail || !diagnostic.hasPrivateKey) {
    const error = new Error('Firebase Admin environment is incomplete.');
    reportInitializationFailure(diagnostic, error);
    throw error;
  }

  try {
    const app = getApps().find((candidate) => candidate.name === '[DEFAULT]')
      || initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
    const firestore = () => getFirestore(app);
    firestore.FieldValue = FieldValue;

    adminInstance = {
      auth: () => getAuth(app),
      firestore,
    };

    return adminInstance;
  } catch (error) {
    reportInitializationFailure(diagnostic, error);
    throw new Error('Firebase Admin initialization failed.');
  }
}