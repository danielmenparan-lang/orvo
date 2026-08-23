// ORVO: Stripe webhook — sole writer of held/funded (service_role).
import { jsonResponse } from '../_shared/cors.ts';
import { requireWebhookSecrets } from '../_shared/stripe-env.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const secrets = requireWebhookSecrets();
  if (secrets instanceof Response) return secrets;

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return jsonResponse({
      error: 'validation_error',
      message: 'Missing stripe-signature header.',
    }, 400);
  }

  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRole) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set SUPABASE_SERVICE_ROLE_KEY in Edge Function secrets.',
    }, 501);
  }

  const body = await req.text();
  const stripe = getStripe(secrets.stripeKey);
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secrets.whsec);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid signature';
    return jsonResponse({ error: 'invalid_signature', message: msg }, 400);
  }

  const admin = createServiceClient(serviceRole);

  const { error: dedupeErr } = await admin.from('stripe_webhook_events').insert({
    id: event.id,
    type: event.type,
  });
  if (dedupeErr?.code === '23505') {
    return jsonResponse({ received: true, duplicate: true });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        id?: string;
        payment_intent?: string | { id?: string } | null;
        metadata?: Record<string, string>;
      };
      const paymentId = session.metadata?.payment_id;
      const requestId = session.metadata?.request_id;
      const quoteId = session.metadata?.quote_id;
      if (!paymentId || !requestId) {
        console.warn('checkout.session.completed missing metadata', session.metadata);
      } else {
        let piId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
        let chargeId: string | null = null;
        if (piId) {
          const pi = await stripe.paymentIntents.retrieve(piId);
          piId = pi.id;
          chargeId = typeof pi.latest_charge === 'string'
            ? pi.latest_charge
            : pi.latest_charge?.id ?? null;
        }
        const now = new Date().toISOString();
        await admin.from('payments').update({
          status: 'held',
          stripe_payment_intent_id: piId,
          stripe_charge_id: chargeId,
          held_at: now,
          paid_at: now,
        }).eq('id', paymentId);
        await admin.from('requests').update({ status: 'funded' }).eq('id', requestId);
        if (quoteId) {
          await admin.from('quotes').update({ status: 'paid' }).eq('id', quoteId);
        }
      }
    }

    if (event.type === 'account.updated') {
      const account = event.data.object as {
        id?: string;
        details_submitted?: boolean;
        payouts_enabled?: boolean;
      };
      if (account.id) {
        const patch: Record<string, unknown> = {};
        if (account.details_submitted) patch.stripe_connect_onboarded_at = new Date().toISOString();
        if (Object.keys(patch).length) {
          await admin.from('profiles')
            .update(patch)
            .eq('stripe_connect_account_id', account.id);
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('stripe-webhook handler:', event.type, msg);
    return jsonResponse({ error: 'handler_failed', message: msg }, 500);
  }

  return jsonResponse({ received: true });
});
