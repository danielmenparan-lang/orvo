// ORVO: release held funds to builder Connect account (Transfer).
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { parseJsonBody, requireBearer, requireUuidField, unauthorized } from '../_shared/auth.ts';
import { requireReleaseSecrets } from '../_shared/stripe-env.ts';
import { createServiceClient, createUserClient } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

type Body = { request_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authHeader = requireBearer(req);
  if (!authHeader) return unauthorized();

  const raw = await parseJsonBody<Body>(req);
  if (raw instanceof Response) return raw;
  const requestId = requireUuidField(raw as Record<string, unknown>, 'request_id');
  if (requestId instanceof Response) return requestId;

  const secrets = requireReleaseSecrets();
  if (secrets instanceof Response) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY, then deploy.',
      request_id: requestId,
    }, 501);
  }

  try {
    const userClient = createUserClient(authHeader);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return unauthorized();

    const admin = createServiceClient(secrets.serviceRole);

    const { data: caller } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    const isAdmin = !!caller?.is_admin;

    const { data: requestRow, error: reqErr } = await admin
      .from('requests')
      .select('id, user_id, status')
      .eq('id', requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!requestRow) {
      return jsonResponse({ error: 'not_found', message: 'Request not found.' }, 404);
    }
    if (requestRow.user_id !== user.id && !isAdmin) {
      return jsonResponse({ error: 'forbidden', message: 'Only the client or admin may release.' }, 403);
    }
    if (requestRow.status === 'disputed') {
      return jsonResponse({ error: 'disputed', message: 'Release frozen while dispute is open.' }, 409);
    }

    const { data: payment, error: payErr } = await admin
      .from('payments')
      .select('*')
      .eq('request_id', requestId)
      .maybeSingle();
    if (payErr) throw payErr;
    if (!payment) {
      return jsonResponse({ error: 'no_payment', message: 'No payment for this request.' }, 400);
    }
    if (payment.status !== 'held') {
      return jsonResponse({
        error: 'invalid_payment',
        message: `Release requires held funds (current: ${payment.status}).`,
      }, 400);
    }
    if (!payment.connected_account_id) {
      return jsonResponse({
        error: 'no_connect',
        message: 'Builder has not completed Connect onboarding.',
      }, 400);
    }
    if (!payment.stripe_charge_id) {
      return jsonResponse({
        error: 'no_charge',
        message: 'Missing stripe_charge_id on payment — webhook may not have completed.',
      }, 400);
    }

    const stripe = getStripe(secrets.stripeKey);
    const transfer = await stripe.transfers.create({
      amount: payment.builder_payout_cents,
      currency: payment.currency || 'usd',
      destination: payment.connected_account_id,
      source_transaction: payment.stripe_charge_id,
      transfer_group: payment.stripe_transfer_group || undefined,
      metadata: {
        request_id: requestId,
        payment_id: payment.id,
      },
    });

    const now = new Date().toISOString();
    await admin.from('payments').update({
      status: 'released',
      released_at: now,
      stripe_transfer_id: transfer.id,
    }).eq('id', payment.id);
    await admin.from('requests').update({ status: 'completed' }).eq('id', requestId);

    return jsonResponse({ released: true, transfer_id: transfer.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('release-to-builder:', msg);
    return jsonResponse({ error: 'release_failed', message: msg, request_id: requestId }, 500);
  }
});
