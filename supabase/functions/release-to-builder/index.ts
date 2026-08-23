// Scaffold — release held funds to builder Connect account.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { parseJsonBody, requireBearer, requireUuidField, unauthorized } from '../_shared/auth.ts';

type Body = { request_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  if (!requireBearer(req)) return unauthorized();

  const raw = await parseJsonBody<Body>(req);
  if (raw instanceof Response) return raw;
  const requestId = requireUuidField(raw as Record<string, unknown>, 'request_id');
  if (requestId instanceof Response) return requestId;

  if (!Deno.env.get('STRIPE_SECRET_KEY') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY, then implement Transfer.',
      request_id: requestId,
    }, 501);
  }

  // TODO: JWT owns request → payment held → Transfer → service-role released + completed
  return jsonResponse({
    error: 'not_implemented',
    message: 'Secrets present but release Transfer not implemented yet.',
    request_id: requestId,
  }, 501);
});
