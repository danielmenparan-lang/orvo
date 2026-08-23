// ORVO: create Stripe Checkout Session for accepted quote (platform charge → held via webhook).
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { parseJsonBody, requireBearer, requireUuidField, unauthorized } from '../_shared/auth.ts';
import { requireCheckoutSecrets, siteUrl, orvoFeePercent } from '../_shared/stripe-env.ts';
import { createServiceClient, createUserClient } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

type Body = { request_id?: string; quote_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authHeader = requireBearer(req);
  if (!authHeader) return unauthorized();

  const raw = await parseJsonBody<Body>(req);
  if (raw instanceof Response) return raw;

  const requestId = requireUuidField(raw as Record<string, unknown>, 'request_id');
  if (requestId instanceof Response) return requestId;
  const quoteId = requireUuidField(raw as Record<string, unknown>, 'quote_id');
  if (quoteId instanceof Response) return quoteId;

  const secrets = requireCheckoutSecrets();
  if (secrets instanceof Response) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY, then deploy.',
      request_id: requestId,
      quote_id: quoteId,
    }, 501);
  }

  try {
    const userClient = createUserClient(authHeader);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return unauthorized();

    const admin = createServiceClient(secrets.serviceRole);
    const { data: requestRow, error: reqErr } = await admin
      .from('requests')
      .select('id, user_id, status, title')
      .eq('id', requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!requestRow || requestRow.user_id !== user.id) {
      return jsonResponse({ error: 'forbidden', message: 'You must own this request.' }, 403);
    }
    if (requestRow.status !== 'awaiting_payment') {
      return jsonResponse({
        error: 'invalid_state',
        message: 'Request must be awaiting_payment before checkout.',
      }, 400);
    }

    const { data: quote, error: quoteErr } = await admin
      .from('quotes')
      .select('id, request_id, builder_id, status, amount_cents')
      .eq('id', quoteId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (quoteErr) throw quoteErr;
    if (!quote || quote.status !== 'accepted') {
      return jsonResponse({ error: 'invalid_quote', message: 'Quote must be accepted.' }, 400);
    }

    const { data: payment, error: payErr } = await admin
      .from('payments')
      .select('*')
      .eq('request_id', requestId)
      .eq('quote_id', quoteId)
      .maybeSingle();
    if (payErr) throw payErr;
    if (!payment) {
      return jsonResponse({ error: 'no_payment', message: 'Accept the quote first (pending payment row).' }, 400);
    }
    if (!['pending', 'checkout_open'].includes(payment.status)) {
      return jsonResponse({ error: 'invalid_payment', message: `Payment status is ${payment.status}.` }, 400);
    }

    const site = siteUrl();
    const stripe = getStripe(secrets.stripeKey);

    if (payment.status === 'checkout_open' && payment.stripe_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(payment.stripe_checkout_session_id);
        if (existing.url && existing.status === 'open') {
          return jsonResponse({ url: existing.url });
        }
      } catch { /* create fresh session below */ }
    }

    const feePercent = orvoFeePercent();
    const amountCents = payment.amount_cents ?? quote.amount_cents;
    const platformFee = Math.round(amountCents * feePercent / 100);
    const builderPayout = amountCents - platformFee;
    const transferGroup = payment.stripe_transfer_group || `orvo_pay_${payment.id}`;

    const { data: builder } = await admin
      .from('profiles')
      .select('stripe_connect_account_id')
      .eq('id', quote.builder_id)
      .maybeSingle();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: `ORVO — ${requestRow.title || 'Custom AI agent'}`,
            description: 'Funds held until you approve delivery',
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        transfer_group: transferGroup,
        metadata: {
          payment_id: payment.id,
          request_id: requestId,
          quote_id: quoteId,
          builder_id: quote.builder_id,
        },
      },
      success_url: `${site}/?checkout=success&rid=${requestId}`,
      cancel_url: `${site}/?checkout=cancel&rid=${requestId}`,
      metadata: {
        payment_id: payment.id,
        request_id: requestId,
        quote_id: quoteId,
      },
      client_reference_id: payment.id,
    });

    const { error: updErr } = await admin.from('payments').update({
      status: 'checkout_open',
      stripe_checkout_session_id: session.id,
      platform_fee_cents: platformFee,
      builder_payout_cents: builderPayout,
      fee_percent: feePercent,
      builder_id: quote.builder_id,
      stripe_transfer_group: transferGroup,
      connected_account_id: builder?.stripe_connect_account_id ?? null,
      currency: 'usd',
    }).eq('id', payment.id);
    if (updErr) throw updErr;

    if (!session.url) {
      return jsonResponse({ error: 'checkout_failed', message: 'Stripe did not return a checkout URL.' }, 502);
    }
    return jsonResponse({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('create-checkout-session:', msg);
    return jsonResponse({ error: 'checkout_failed', message: msg }, 500);
  }
});
