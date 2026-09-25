// Phase 2 foundations only.
// This file intentionally does not expose active endpoints yet.
// Authentication endpoints and user management will be added in a later phase.

export const AUTH_BACKEND_PLATFORM = 'Firebase Cloud Functions';
export const AUTH_BACKEND_STATUS = 'foundation-only';

export function describeAuthBackendFoundation() {
  return {
    platform: AUTH_BACKEND_PLATFORM,
    purpose: 'Trusted server-side boundary for Firebase Admin SDK, custom tokens, role enforcement, and secure auth storage.',
    activeEndpoints: [],
    notes: 'No reporting or Google Sheets logic is touched by this foundation layer.',
  };
}
