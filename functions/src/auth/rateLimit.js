export function createRateLimitWindow() {
  return {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    strategy: 'server-side rate limiting with Firebase Firestore-backed counters',
  };
}

export function describeRateLimitStrategy() {
  return {
    method: 'Firestore-based counters per NIK or IP',
    enforcement: 'trusted backend only',
    notes: 'Do not rely on in-memory counters because serverless instances can scale and restart.',
  };
}
