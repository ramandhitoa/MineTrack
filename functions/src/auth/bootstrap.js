import { getFirebaseAdmin } from '../firebaseAdmin.js';
import { APP_ROLES, USER_STATUS } from './authorization.js';
import {
  AUTH_AUDIT_EVENT,
  AUTH_BOOTSTRAP_FIELD,
  AUTH_BOOTSTRAP_STATUS,
  AUTH_COLLECTIONS,
  AUTH_USER_FIELD,
} from './firestoreSchema.js';

export function normalizeNik(value) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new Error('NIK is required.');
  }

  if (!/^[A-Za-z0-9-]+$/.test(normalized)) {
    throw new Error('NIK contains invalid characters.');
  }

  return normalized;
}

export function normalizeDisplayName(value) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new Error('Display name is required.');
  }

  return normalized;
}

export function normalizeEmail(value) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (!normalized || !normalized.includes('@')) {
    throw new Error('A valid email is required.');
  }

  return normalized;
}

export function isValidRole(value) {
  return Object.values(APP_ROLES).includes(value);
}

export function isValidStatus(value) {
  return Object.values(USER_STATUS).includes(value);
}

export function createAuthUserDocument({
  uid,
  nik,
  name,
  role = APP_ROLES.USER,
  status = USER_STATUS.ACTIVE,
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString(),
  lastLoginAt = null,
}) {
  const normalizedNik = normalizeNik(nik);
  const normalizedName = normalizeDisplayName(name);

  if (!isValidRole(role)) {
    throw new Error('Invalid role value.');
  }

  if (!isValidStatus(status)) {
    throw new Error('Invalid status value.');
  }

  return {
    [AUTH_USER_FIELD.uid]: String(uid),
    [AUTH_USER_FIELD.nik]: normalizedNik,
    [AUTH_USER_FIELD.name]: normalizedName,
    [AUTH_USER_FIELD.role]: role,
    [AUTH_USER_FIELD.status]: status,
    [AUTH_USER_FIELD.createdAt]: createdAt,
    [AUTH_USER_FIELD.updatedAt]: updatedAt,
    [AUTH_USER_FIELD.lastLoginAt]: lastLoginAt,
  };
}

export function createAuthAuditEvent({
  event,
  actorUid,
  actorNik,
  targetUid,
  targetNik,
  details = {},
  createdAt = new Date().toISOString(),
}) {
  const safeDetails = { ...details };
  delete safeDetails.password;
  delete safeDetails.passwordHash;
  delete safeDetails.plaintextPassword;

  return {
    event,
    actorUid: actorUid || null,
    actorNik: actorNik || null,
    targetUid: targetUid || null,
    targetNik: targetNik || null,
    details: safeDetails,
    createdAt,
  };
}

export function assertUserIsActive(user) {
  if (!user) {
    throw new Error('User not found.');
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw new Error('User account is disabled.');
  }

  return true;
}

export function assertRoleChangeAllowed({ actorRole, targetRole, action = 'role-change' }) {
  if (!actorRole) {
    throw new Error('Authentication required.');
  }

  if (!isValidRole(targetRole)) {
    throw new Error(`Invalid target role for ${action}.`);
  }

  if (actorRole === APP_ROLES.OWNER) {
    return true;
  }

  if (actorRole === APP_ROLES.APP_ADMIN) {
    if (targetRole === APP_ROLES.OWNER || targetRole === APP_ROLES.APP_ADMIN) {
      throw new Error('APP_ADMIN cannot manage OWNER or APP_ADMIN roles.');
    }
    return true;
  }

  throw new Error('User cannot change roles.');
}

export function assertOwnerBootstrapAllowed({ actorRole, ownerExists, bootstrapStatus }) {
  if (actorRole && actorRole !== APP_ROLES.OWNER) {
    throw new Error('Only OWNER can bootstrap a MineTrack owner.');
  }

  if (ownerExists || bootstrapStatus === AUTH_BOOTSTRAP_STATUS.COMPLETE || bootstrapStatus === AUTH_BOOTSTRAP_STATUS.LOCKED) {
    throw new Error('Owner bootstrap is already locked or completed.');
  }

  return true;
}

export function buildOwnerBootstrapRecord({
  email,
  nik,
  name,
  uid = 'bootstrap-owner',
  status = USER_STATUS.ACTIVE,
  createdAt = new Date().toISOString(),
}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedNik = normalizeNik(nik);
  const normalizedName = normalizeDisplayName(name);

  const userRecord = createAuthUserDocument({
    uid,
    nik: normalizedNik,
    name: normalizedName,
    role: APP_ROLES.OWNER,
    status,
    createdAt,
    updatedAt: createdAt,
  });

  return {
    ownerRecord: userRecord,
    bootstrapState: {
      [AUTH_BOOTSTRAP_FIELD.appOwnerEmail]: normalizedEmail,
      [AUTH_BOOTSTRAP_FIELD.appOwnerNik]: normalizedNik,
      [AUTH_BOOTSTRAP_FIELD.ownerUid]: uid,
      [AUTH_BOOTSTRAP_FIELD.status]: AUTH_BOOTSTRAP_STATUS.COMPLETE,
      [AUTH_BOOTSTRAP_FIELD.bootstrappedAt]: createdAt,
      [AUTH_BOOTSTRAP_FIELD.updatedAt]: createdAt,
    },
  };
}

export async function bootstrapMineTrackOwner({
  actor,
  email,
  nik,
  name,
  firestore = null,
}) {
  const actorRole = actor && actor.role ? actor.role : null;
  const normalizedEmail = normalizeEmail(email);
  const normalizedNik = normalizeNik(nik);
  const normalizedName = normalizeDisplayName(name);

  if (actorRole && actorRole !== APP_ROLES.OWNER) {
    throw new Error('Only trusted OWNER bootstrap can create the MineTrack owner.');
  }

  const targetUid = actor && actor.uid ? actor.uid : `owner-bootstrap-${Date.now()}`;

  if (!firestore) {
    const dryRunUser = createAuthUserDocument({
      uid: targetUid,
      nik: normalizedNik,
      name: normalizedName,
      role: APP_ROLES.OWNER,
      status: USER_STATUS.ACTIVE,
    });

    return {
      dryRun: true,
      ownerRecord: dryRunUser,
      bootstrapState: {
        [AUTH_BOOTSTRAP_FIELD.appOwnerEmail]: normalizedEmail,
        [AUTH_BOOTSTRAP_FIELD.appOwnerNik]: normalizedNik,
        [AUTH_BOOTSTRAP_FIELD.ownerUid]: targetUid,
        [AUTH_BOOTSTRAP_FIELD.status]: AUTH_BOOTSTRAP_STATUS.COMPLETE,
        [AUTH_BOOTSTRAP_FIELD.updatedAt]: new Date().toISOString(),
      },
      auditEvent: createAuthAuditEvent({
        event: AUTH_AUDIT_EVENT.OWNER_BOOTSTRAP,
        actorUid: actor && actor.uid ? actor.uid : null,
        actorNik: actor && actor.nik ? actor.nik : null,
        targetUid: targetUid,
        targetNik: normalizedNik,
        details: { bootstrapSource: 'trusted_backend_only', ownerEmail: normalizedEmail },
      }),
    };
  }

  const ownerSnapshot = await firestore
    .collection(AUTH_COLLECTIONS.users)
    .where(AUTH_USER_FIELD.role, '==', APP_ROLES.OWNER)
    .limit(1)
    .get();

  const bootstrapState = await firestore
    .collection(AUTH_COLLECTIONS.appConfig)
    .doc(AUTH_BOOTSTRAP_FIELD.ownerBootstrapDoc)
    .get();

  assertOwnerBootstrapAllowed({
    actorRole,
    ownerExists: !ownerSnapshot.empty,
    bootstrapStatus: bootstrapState.exists ? bootstrapState.data()?.status : AUTH_BOOTSTRAP_STATUS.PENDING,
  });

  const ownerRecord = createAuthUserDocument({
    uid: targetUid,
    nik: normalizedNik,
    name: normalizedName,
    role: APP_ROLES.OWNER,
    status: USER_STATUS.ACTIVE,
  });

  await firestore.collection(AUTH_COLLECTIONS.users).doc(targetUid).set(ownerRecord, { merge: true });
  await firestore.collection(AUTH_COLLECTIONS.appConfig).doc(AUTH_BOOTSTRAP_FIELD.ownerBootstrapDoc).set(
    {
      [AUTH_BOOTSTRAP_FIELD.appOwnerEmail]: normalizedEmail,
      [AUTH_BOOTSTRAP_FIELD.appOwnerNik]: normalizedNik,
      [AUTH_BOOTSTRAP_FIELD.ownerUid]: targetUid,
      [AUTH_BOOTSTRAP_FIELD.status]: AUTH_BOOTSTRAP_STATUS.LOCKED,
      [AUTH_BOOTSTRAP_FIELD.updatedAt]: new Date().toISOString(),
    },
    { merge: true }
  );

  const auditEvent = createAuthAuditEvent({
    event: AUTH_AUDIT_EVENT.OWNER_BOOTSTRAP,
    actorUid: actor && actor.uid ? actor.uid : null,
    actorNik: actor && actor.nik ? actor.nik : null,
    targetUid: targetUid,
    targetNik: normalizedNik,
    details: { bootstrapSource: 'trusted_backend_only', ownerEmail: normalizedEmail },
  });

  await firestore.collection(AUTH_COLLECTIONS.audits).add(auditEvent);

  return {
    dryRun: false,
    ownerRecord,
    bootstrapState: {
      [AUTH_BOOTSTRAP_FIELD.appOwnerEmail]: normalizedEmail,
      [AUTH_BOOTSTRAP_FIELD.appOwnerNik]: normalizedNik,
      [AUTH_BOOTSTRAP_FIELD.ownerUid]: targetUid,
      [AUTH_BOOTSTRAP_FIELD.status]: AUTH_BOOTSTRAP_STATUS.LOCKED,
      [AUTH_BOOTSTRAP_FIELD.updatedAt]: new Date().toISOString(),
    },
    auditEvent,
  };
}

