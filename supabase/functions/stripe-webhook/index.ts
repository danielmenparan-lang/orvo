// Scaffold only — webhook sole writer of held/funded.
// Supabase Edge Function: stripe-webhook

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 });
  }
  // TODO: verify Stripe signature, on checkout.session.completed → payment held + request funded
  return new Response(
    JSON.stringify({ error: 'not_configured' }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  );
});
