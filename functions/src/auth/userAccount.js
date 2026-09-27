import { APP_ROLES, USER_STATUS } from './authorization.js';
import { createAuthUserDocument, normalizeNik } from './bootstrap.js';

export function createUserAccount({
  uid,
  nik,
  name,
  role = APP_ROLES.USER,
  status = USER_STATUS.ACTIVE,
  password,
  passwordHash,
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString(),
}) {
  const safeUser = createAuthUserDocument({
    uid,
    nik,
    name,
    role,
    status,
    createdAt,
    updatedAt,
  });

  delete safeUser.password;
  delete safeUser.passwordHash;
  delete safeUser.plaintextPassword;

  if (password !== undefined) {
    delete safeUser.password;
  }

  if (passwordHash !== undefined) {
    delete safeUser.passwordHash;
  }

  return safeUser;
}

export async function authenticateUserByNik({
  nik,
  password,
  adapter,
  auditLogger = null,
}) {
  const normalizedNik = normalizeNik(nik);

  if (!adapter || typeof adapter.findUserByNik !== 'function' || typeof adapter.verifyPassword !== 'function') {
    throw new Error('Authentication backend is not configured.');
  }

  const user = await adapter.findUserByNik(normalizedNik);

  if (!user) {
    throw new Error('User not found.');
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    const failedAudit = typeof auditLogger === 'function'
      ? await auditLogger({
          event: 'LOGIN_FAILED',
          actorNik: normalizedNik,
          targetNik: normalizedNik,
          details: { reason: 'disabled-account', userStatus: user.status },
        })
      : null;

    if (failedAudit) {
      return { session: null, audit: failedAudit, user: null };
    }

    throw new Error('User account is disabled.');
  }

  const passwordVerified = await adapter.verifyPassword({
    nik: normalizedNik,
    password,
    user,
  });

  if (!passwordVerified) {
    if (typeof auditLogger === 'function') {
      await auditLogger({
        event: 'LOGIN_FAILED',
        actorNik: normalizedNik,
        targetNik: normalizedNik,
        details: { reason: 'bad-password' },
      });
    }

    throw new Error('Invalid NIK or password.');
  }

  const safeUser = createUserAccount({
    uid: user.uid,
    nik: user.nik || normalizedNik,
    name: user.name || 'MineTrack User',
    role: user.role || APP_ROLES.USER,
    status: user.status || USER_STATUS.ACTIVE,
  });

  return {
    user: safeUser,
    session: {
      user: safeUser,
      authenticatedAt: new Date().toISOString(),
      active: true,
    },
  };
}
