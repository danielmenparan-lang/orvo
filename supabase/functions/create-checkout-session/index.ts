// Scaffold only — do not deploy without secrets review.
// Supabase Edge Function: create-checkout-session
// Full contract: docs/payments/STRIPE-CONNECT-MVP.md + docs/payments/EDGE-FUNCTIONS.md

import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { parseJsonBody, requireBearer, requireUuidField, unauthorized } from '../_shared/auth.ts';
import { requireStripeSecret, siteUrl, orvoFeePercent } from '../_shared/stripe-env.ts';

type Body = { request_id?: string; quote_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  if (!requireBearer(req)) return unauthorized();

  const raw = await parseJsonBody<Body>(req);
  if (raw instanceof Response) return raw;

  const requestId = requireUuidField(raw as Record<string, unknown>, 'request_id');
  if (requestId instanceof Response) return requestId;
  const quoteId = requireUuidField(raw as Record<string, unknown>, 'quote_id');
  if (quoteId instanceof Response) return quoteId;

  const stripeCheck = requireStripeSecret();
  if (stripeCheck instanceof Response) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY and implement Checkout Session creation.',
      request_id: requestId,
      quote_id: quoteId,
    }, 501);
  }

  const _site = siteUrl();
  const _fee = orvoFeePercent();

  // TODO when secrets exist:
  // 1. Verify JWT, load quote/request ownership (service role)
  // 2. fee = round(amount * ORVO_FEE_PERCENT / 100)  // _fee = ${ _fee }
  // 3. stripe.checkout.sessions.create({
  //      mode: 'payment',
  //      success_url: `${_site}/?checkout=success&rid=${requestId}`,
  //      cancel_url: `${_site}/?checkout=cancel&rid=${requestId}`,
  //      metadata: { request_id, quote_id },
  //      payment_intent_data: { transfer_group: `orvo_${request_id}` },
  //    })
  // 4. Upsert payments.stripe_checkout_session_id
  // 5. Return { url: session.url }
  return jsonResponse({
    error: 'not_implemented',
    message: 'STRIPE_SECRET_KEY is set but Checkout Session creation is not implemented yet.',
    request_id: requestId,
    quote_id: quoteId,
  }, 501);
});
