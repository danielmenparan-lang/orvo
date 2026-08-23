// Scaffold only — webhook is the sole writer of held/funded.
import { jsonResponse } from '../_shared/cors.ts';
import { requireWebhookSecrets } from '../_shared/stripe-env.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const secrets = requireWebhookSecrets();
  if (secrets instanceof Response) return secrets;

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return jsonResponse({
      error: 'validation_error',
      message: 'Missing stripe-signature header.',
    }, 400);
  }

  // TODO when secrets exist:
  // 1. const body = await req.text()
  // 2. constructEvent(body, sig, secrets.whsec)
  // 3. INSERT stripe_webhook_events (evt.id) — sql/017; ON CONFLICT → return 200 { received: true }
  // 4. checkout.session.completed:
  //    service-role UPDATE payments SET status='held', held_at=now(), stripe_payment_intent_id=…
  //    service-role UPDATE requests SET status='funded' WHERE id = metadata.request_id
  // 5. account.updated → sync profiles.stripe_connect_* for builder payouts
  // 6. Return { received: true }
  return jsonResponse({
    error: 'not_implemented',
    message: 'Secrets present but webhook handler not implemented yet.',
  }, 501);
});
