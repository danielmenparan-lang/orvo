// Scaffold only — webhook is the sole writer of held/funded.
import { jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const whsec = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!whsec || !stripeKey) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_WEBHOOK_SECRET and STRIPE_SECRET_KEY before deploying.',
    }, 501);
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return jsonResponse({
      error: 'validation_error',
      message: 'Missing stripe-signature header.',
    }, 400);
  }

  // TODO when secrets exist:
  // 1. const body = await req.text()
  // 2. constructEvent(body, sig, whsec)
  // 3. if evt.id in stripe_webhook_events (sql/017) → 200
  // 4. checkout.session.completed → service-role: payment held + request funded
  return jsonResponse({
    error: 'not_implemented',
    message: 'Secrets present but webhook handler not implemented yet.',
  }, 501);
});
