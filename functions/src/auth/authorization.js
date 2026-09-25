export const APP_ROLES = Object.freeze({
  OWNER: 'OWNER',
  APP_ADMIN: 'APP_ADMIN',
  USER: 'USER',
});

export const USER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
});

export function requireRole(session, allowedRoles = []) {
  if (!session || !session.role) {
    throw new Error('Authentication required.');
  }

  if (!allowedRoles.includes(session.role)) {
    throw new Error('Authorization required.');
  }

  return true;
}

export function requireOwner(session) {
  return requireRole(session, [APP_ROLES.OWNER]);
}

export function requireAppAdminOrOwner(session) {
  return requireRole(session, [APP_ROLES.OWNER, APP_ROLES.APP_ADMIN]);
}
