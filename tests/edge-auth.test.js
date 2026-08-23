/**
 * node tests/edge-auth.test.js
 * Mirrors UUID validation in supabase/functions/_shared/auth.ts
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(value);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

assert(isUuid('550e8400-e29b-41d4-a716-446655440000'), 'valid uuid v4');
assert(isUuid('00000000-0000-4000-8000-000000000000'), 'valid nil-ish uuid');
assert(!isUuid(''), 'empty rejected');
assert(!isUuid('not-a-uuid'), 'garbage rejected');
assert(!isUuid('550e8400-e29b-41d4-a716'), 'truncated rejected');
assert(!isUuid('550e8400-e29b-41d4-a716-446655440000-extra'), 'suffix rejected');

console.log('edge-auth tests passed');
