// Scaffold only — do not deploy without secrets review.
// Supabase Edge Function: create-checkout-session
// Full contract: docs/payments/STRIPE-CONNECT-MVP.md + docs/payments/EDGE-FUNCTIONS.md
//
// Client (app.js tryCreateCheckoutSession) POSTs:
//   { request_id, quote_id }
// with Authorization: Bearer <user JWT>
//
// Success: { url: "https://checkout.stripe.com/..." }
// Not ready: HTTP 501 { error: "not_configured" }  ← app shows awaiting_payment UI

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, apikey',
        'access-control-allow-methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return new Response(
      JSON.stringify({
        error: 'not_configured',
        message: 'Set STRIPE_SECRET_KEY and implement Checkout Session creation.',
      }),
      {
        status: 501,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        },
      },
    );
  }

  // TODO when secrets exist:
  // 1. Verify JWT, load quote/request ownership
  // 2. stripe.checkout.sessions.create({ mode: 'payment', metadata: { request_id, quote_id }, ... })
  // 3. Return { url: session.url }
  return new Response(
    JSON.stringify({
      error: 'not_implemented',
      message: 'STRIPE_SECRET_KEY is set but Checkout Session creation is not implemented yet.',
    }),
    {
      status: 501,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
    },
  );
});
