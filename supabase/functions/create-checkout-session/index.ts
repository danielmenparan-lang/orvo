// Scaffold only — do not deploy without secrets review.
// Supabase Edge Function: create-checkout-session
// Full contract: docs/payments/STRIPE-CONNECT-MVP.md + docs/payments/EDGE-FUNCTIONS.md

import { corsHeaders, jsonResponse, optionsResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY and implement Checkout Session creation.',
    }, 501);
  }

  // TODO when secrets exist:
  // 1. Verify JWT, load quote/request ownership
  // 2. stripe.checkout.sessions.create({
  //      mode: 'payment',
  //      success_url: `${ORVO_APP_URL}/?checkout=success`,
  //      cancel_url: `${ORVO_APP_URL}/?checkout=cancel`,
  //      metadata: { request_id, quote_id },
  //      payment_intent_data: { transfer_group: `orvo_${request_id}` },
  //    })
  // 3. Upsert payments.stripe_checkout_session_id
  // 4. Return { url: session.url }
  return jsonResponse({
    error: 'not_implemented',
    message: 'STRIPE_SECRET_KEY is set but Checkout Session creation is not implemented yet.',
  }, 501);
});
