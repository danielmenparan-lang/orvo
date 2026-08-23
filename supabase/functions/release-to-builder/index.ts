// Scaffold — release held funds to builder Connect account.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { parseJsonBody, requireBearer, requireUuidField, unauthorized } from '../_shared/auth.ts';
import { requireReleaseSecrets } from '../_shared/stripe-env.ts';

type Body = { request_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  if (!requireBearer(req)) return unauthorized();

  const raw = await parseJsonBody<Body>(req);
  if (raw instanceof Response) return raw;
  const requestId = requireUuidField(raw as Record<string, unknown>, 'request_id');
  if (requestId instanceof Response) return requestId;

  const secrets = requireReleaseSecrets();
  if (secrets instanceof Response) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY, then implement Transfer.',
      request_id: requestId,
    }, 501);
  }

  // TODO when secrets exist:
  // 1. Verify JWT — client owns request OR admin
  // 2. Load payment (held) + request (funded/delivered) + builder Connect account id
  // 3. stripe.transfers.create({ amount: builder_payout_cents, destination: connect_acct, transfer_group })
  // 4. service-role UPDATE payments SET status='released', released_at=now()
  // 5. service-role UPDATE requests SET status='completed'
  // 6. Return { released: true, transfer_id }
  return jsonResponse({
    error: 'not_implemented',
    message: 'Secrets present but release Transfer not implemented yet.',
    request_id: requestId,
  }, 501);
});
