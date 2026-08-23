// ORVO: Stripe Connect Express onboarding for approved builders.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { requireBearer, unauthorized } from '../_shared/auth.ts';
import { requireCheckoutSecrets, siteUrl } from '../_shared/stripe-env.ts';
import { createServiceClient, createUserClient } from '../_shared/supabase.ts';
import { getStripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authHeader = requireBearer(req);
  if (!authHeader) return unauthorized();

  const secrets = requireCheckoutSecrets();
  if (secrets instanceof Response) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY before Connect onboarding.',
    }, 501);
  }

  try {
    const userClient = createUserClient(authHeader);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return unauthorized();

    const admin = createServiceClient(secrets.serviceRole);
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('id, email, full_name, builder_status, stripe_connect_account_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profErr) throw profErr;
    if (!profile || profile.builder_status !== 'approved') {
      return jsonResponse({
        error: 'not_builder',
        message: 'Approved builder status required for payout onboarding.',
      }, 403);
    }

    const stripe = getStripe(secrets.stripeKey);
    const site = siteUrl();
    let accountId = profile.stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: profile.email || user.email || undefined,
        capabilities: { transfers: { requested: true } },
        metadata: { orvo_profile_id: user.id },
      });
      accountId = account.id;
      await admin.from('profiles').update({
        stripe_connect_account_id: accountId,
      }).eq('id', user.id);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${site}/?connect=refresh`,
      return_url: `${site}/?connect=success`,
      type: 'account_onboarding',
    });

    if (!link.url) {
      return jsonResponse({ error: 'connect_failed', message: 'Stripe did not return an onboarding URL.' }, 502);
    }
    return jsonResponse({ url: link.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('create-connect-account:', msg);
    return jsonResponse({ error: 'connect_failed', message: msg }, 500);
  }
});
