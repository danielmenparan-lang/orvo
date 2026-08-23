// Scaffold only — do not deploy without secrets review.
// Supabase Edge Function: create-checkout-session
// Full contract: docs/payments/STRIPE-CONNECT-MVP.md + docs/payments/EDGE-FUNCTIONS.md

import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

type Body = { request_id?: string; quote_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json', message: 'Expected JSON body.' }, 400);
  }

  const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
  const quoteId = typeof body.quote_id === 'string' ? body.quote_id.trim() : '';
  if (!requestId || !quoteId) {
    return jsonResponse({
      error: 'validation_error',
      message: 'request_id and quote_id are required.',
    }, 400);
  }

  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'unauthorized', message: 'Bearer JWT required.' }, 401);
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY and implement Checkout Session creation.',
      request_id: requestId,
      quote_id: quoteId,
    }, 501);
  }

  // TODO when secrets exist:
  // 1. Verify JWT, load quote/request ownership (service role)
  // 2. stripe.checkout.sessions.create({
  //      mode: 'payment',
  //      success_url: `${SITE_URL}/?checkout=success`,
  //      cancel_url: `${SITE_URL}/?checkout=cancel`,
  //      metadata: { request_id, quote_id },
  //      payment_intent_data: { transfer_group: `orvo_${request_id}` },
  //    })
  // 3. Upsert payments.stripe_checkout_session_id
  // 4. Return { url: session.url }
  return jsonResponse({
    error: 'not_implemented',
    message: 'STRIPE_SECRET_KEY is set but Checkout Session creation is not implemented yet.',
    request_id: requestId,
    quote_id: quoteId,
  }, 501);
});
