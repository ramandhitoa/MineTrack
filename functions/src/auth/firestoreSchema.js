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

export const AUTH_AUDIT_EVENT = Object.freeze({
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  CREATE_USER: 'CREATE_USER',
  DISABLE_USER: 'DISABLE_USER',
  ENABLE_USER: 'ENABLE_USER',
  RESET_PASSWORD: 'RESET_PASSWORD',
  ROLE_CHANGE: 'ROLE_CHANGE',
});
