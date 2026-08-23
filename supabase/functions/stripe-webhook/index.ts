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
  // 3. if evt.id in stripe_webhook_events (sql/017) → 200
  // 4. checkout.session.completed → service-role: payment held + request funded
  return jsonResponse({
    error: 'not_implemented',
    message: 'Secrets present but webhook handler not implemented yet.',
  }, 501);
});
