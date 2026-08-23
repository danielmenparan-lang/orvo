// Scaffold only — webhook is the sole writer of held/funded.
// Supabase Edge Function: stripe-webhook
// Contract: docs/payments/STRIPE-CONNECT-MVP.md + EDGE-FUNCTIONS.md
//
// On checkout.session.completed (after signature verify):
//   payments.status = 'held', paid_at = now(), stripe_payment_intent_id = …
//   requests.status = 'funded'
// Never trust the browser for these transitions.

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const whsec = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!whsec || !stripeKey) {
    return new Response(
      JSON.stringify({
        error: 'not_configured',
        message: 'Set STRIPE_WEBHOOK_SECRET and STRIPE_SECRET_KEY before deploying.',
      }),
      { status: 501, headers: { 'content-type': 'application/json' } },
    );
  }

  // TODO when secrets exist:
  // 1. const sig = req.headers.get('stripe-signature')
  // 2. constructEvent(body, sig, whsec)
  // 3. if event.type === 'checkout.session.completed' → service-role update payment+request
  return new Response(
    JSON.stringify({
      error: 'not_implemented',
      message: 'Secrets present but webhook handler not implemented yet.',
    }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  );
});
