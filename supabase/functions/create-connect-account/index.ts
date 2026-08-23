// Scaffold — Stripe Connect Express onboarding for builders.
// Contract: docs/payments/STRIPE-CONNECT-MVP.md
// Input: {} (uses JWT user)
// Output: { url } Account Link URL — or 501 not_configured

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

  if (!Deno.env.get('STRIPE_SECRET_KEY')) {
    return new Response(
      JSON.stringify({
        error: 'not_configured',
        message: 'Set STRIPE_SECRET_KEY, then create Express account + Account Link.',
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

  // TODO: verify JWT → create/retrieve Express account → Account Links.create → return { url }
  return new Response(
    JSON.stringify({
      error: 'not_implemented',
      message: 'Connect onboarding not implemented yet — secrets present.',
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
