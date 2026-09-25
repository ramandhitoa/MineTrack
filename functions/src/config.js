export const SERVER_ENV_KEYS = {
  projectId: 'FIREBASE_PROJECT_ID',
  clientEmail: 'FIREBASE_CLIENT_EMAIL',
  privateKey: 'FIREBASE_PRIVATE_KEY',
  appOwnerEmail: 'FIREBASE_BOOTSTRAP_OWNER_EMAIL',
};

export function getServerEnvValue(key, fallback = '') {
  const value = process.env[key];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

export function getServerEnvSummary() {
  return {
    projectId: getServerEnvValue(SERVER_ENV_KEYS.projectId),
    clientEmail: getServerEnvValue(SERVER_ENV_KEYS.clientEmail),
    appOwnerEmail: getServerEnvValue(SERVER_ENV_KEYS.appOwnerEmail),
    hasPrivateKey: Boolean(getServerEnvValue(SERVER_ENV_KEYS.privateKey)),
  };
}

export function assertServerEnv() {
  const summary = getServerEnvSummary();

  if (!summary.projectId) {
    throw new Error('Missing FIREBASE_PROJECT_ID in server environment.');
  }

  if (!summary.clientEmail) {
    throw new Error('Missing FIREBASE_CLIENT_EMAIL in server environment.');
  }

  if (!summary.hasPrivateKey) {
    throw new Error('Missing FIREBASE_PRIVATE_KEY in server environment.');
  }

  return summary;
}
