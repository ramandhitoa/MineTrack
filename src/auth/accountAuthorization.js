const ROLES = ['OWNER', 'APP_ADMIN', 'USER'];
const STATUSES = ['ACTIVE', 'DISABLED'];

export function canManageAccountAction({ actorRole, targetRole, action, value }) {
  if (!ROLES.includes(actorRole) || !ROLES.includes(targetRole) || targetRole === 'OWNER') {
    return false;
  }

  if (action === 'status') {
    if (!STATUSES.includes(value)) return false;
    return actorRole === 'OWNER' || (actorRole === 'APP_ADMIN' && targetRole === 'USER');
  }

  if (action === 'role') {
    return actorRole === 'OWNER'
      && ['USER', 'APP_ADMIN'].includes(value)
      && value !== targetRole;
  }

  return false;
}