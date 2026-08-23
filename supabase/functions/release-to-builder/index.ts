// Scaffold — release held funds to builder Connect account.
// Contract: docs/payments/STRIPE-CONNECT-MVP.md + EDGE-FUNCTIONS.md
// Input: { request_id }
// Auth: Bearer JWT — must be request owner (or admin)
// Requires: payment.status === 'held'; builder has stripe_connect_account_id
// Success: { ok: true, transfer_id } + DB payment released, request completed
// Not ready: HTTP 501 { error: "not_configured" }

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

  if (!Deno.env.get('STRIPE_SECRET_KEY') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return new Response(
      JSON.stringify({
        error: 'not_configured',
        message: 'Set STRIPE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY, then implement Transfer.',
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
  // 1. Verify JWT owns request (or admin)
  // 2. Load payment held + builder Connect account
  // 3. stripe.transfers.create({ amount, destination, source_transaction, transfer_group })
  // 4. Service-role: payment released + request completed
  return new Response(
    JSON.stringify({
      error: 'not_implemented',
      message: 'Secrets present but release Transfer not implemented yet.',
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
