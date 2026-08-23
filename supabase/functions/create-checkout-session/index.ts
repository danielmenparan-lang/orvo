// Scaffold only — do not deploy without secrets review.
// Supabase Edge Function: create-checkout-session
// Full contract: docs/payments/STRIPE-CONNECT-MVP.md

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }
  // TODO: auth user JWT, load quote/request, create Stripe Checkout Session
  return new Response(
    JSON.stringify({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY and implement Checkout Session creation.',
    }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  );
});
