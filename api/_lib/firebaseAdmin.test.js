import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { getFirebaseAdmin } from './firebaseAdmin.js';

const require = createRequire(import.meta.url);

test('Firebase Admin ID token verifier loads without a CommonJS-to-ESM error', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const previousEnvironment = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  };

  process.env.FIREBASE_PROJECT_ID = 'firebase-admin-module-load-test';
  process.env.FIREBASE_CLIENT_EMAIL = 'module-load-test@example.invalid';
  process.env.FIREBASE_PRIVATE_KEY = privateKey;

  try {
    const jwksRsaPath = require.resolve('jwks-rsa');
    assert.equal(typeof require('jwks-rsa'), 'function');

    const { retrieveSigningKeys } = require(join(dirname(jwksRsaPath), 'utils.js'));
    const publicJwk = createPublicKey(publicKey).export({ format: 'jwk' });
    const [signingKey] = await retrieveSigningKeys([{
      ...publicJwk,
      use: 'sig',
      alg: 'RS256',
      kid: 'module-load-test',
    }]);
    assert.equal(signingKey.kid, 'module-load-test');
    assert.match(signingKey.getPublicKey(), /-----BEGIN PUBLIC KEY-----/);

    const admin = getFirebaseAdmin();
    const auth = admin.auth();
    assert.equal(typeof auth.verifyIdToken, 'function');

    await assert.rejects(
      () => auth.verifyIdToken('not-a-valid-firebase-token'),
      (error) => error?.code !== 'ERR_REQUIRE_ESM'
    );
  } finally {
    if (previousEnvironment.projectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = previousEnvironment.projectId;
    if (previousEnvironment.clientEmail === undefined) delete process.env.FIREBASE_CLIENT_EMAIL;
    else process.env.FIREBASE_CLIENT_EMAIL = previousEnvironment.clientEmail;
    if (previousEnvironment.privateKey === undefined) delete process.env.FIREBASE_PRIVATE_KEY;
    else process.env.FIREBASE_PRIVATE_KEY = previousEnvironment.privateKey;
  }
});