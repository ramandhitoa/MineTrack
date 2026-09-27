export const AUTH_COLLECTIONS = Object.freeze({
  users: 'users',
  audits: 'audits',
  appConfig: 'appConfig',
});

export const AUTH_USER_FIELD = Object.freeze({
  uid: 'uid',
  nik: 'nik',
  name: 'name',
  role: 'role',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  lastLoginAt: 'lastLoginAt',
});

export const AUTH_BOOTSTRAP_FIELD = Object.freeze({
  ownerBootstrapDoc: 'ownerBootstrap',
  appOwnerEmail: 'appOwnerEmail',
  appOwnerNik: 'appOwnerNik',
  ownerUid: 'ownerUid',
  status: 'status',
  bootstrappedAt: 'bootstrappedAt',
  updatedAt: 'updatedAt',
});

export const AUTH_BOOTSTRAP_STATUS = Object.freeze({
  PENDING: 'PENDING',
  LOCKED: 'LOCKED',
  COMPLETE: 'COMPLETE',
});

export const AUTH_AUDIT_EVENT = Object.freeze({
  OWNER_BOOTSTRAP: 'OWNER_BOOTSTRAP',
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  CREATE_USER: 'CREATE_USER',
  DISABLE_USER: 'DISABLE_USER',
  ENABLE_USER: 'ENABLE_USER',
  RESET_PASSWORD: 'RESET_PASSWORD',
  ROLE_CHANGE: 'ROLE_CHANGE',
});
