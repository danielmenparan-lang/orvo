/** Shared request helpers for ORVO Edge Function scaffolds */
import { jsonResponse } from './cors.ts';

export function requireBearer(req: Request): string | null {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth;
}

export function unauthorized(message = 'Bearer JWT required.') {
  return jsonResponse({ error: 'unauthorized', message }, 401);
}

export async function parseJsonBody<T extends Record<string, unknown>>(
  req: Request,
): Promise<T | Response> {
  try {
    return (await req.json()) as T;
  } catch {
    return jsonResponse({ error: 'invalid_json', message: 'Expected JSON body.' }, 400);
  }
}

export function requireUuidField(
  body: Record<string, unknown>,
  field: string,
): string | Response {
  const v = typeof body[field] === 'string' ? body[field].trim() : '';
  if (!v) {
    return jsonResponse({
      error: 'validation_error',
      message: `${field} is required.`,
    }, 400);
  }
  return v;
}
