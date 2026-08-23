// Scaffold — Stripe Connect Express onboarding for builders.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { requireBearer, unauthorized } from '../_shared/auth.ts';
import { requireStripeSecret, siteUrl } from '../_shared/stripe-env.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  if (!requireBearer(req)) return unauthorized();

  const stripeCheck = requireStripeSecret();
  if (stripeCheck instanceof Response) return stripeCheck;

  const _site = siteUrl();

  // TODO: verify JWT → create/retrieve Express account → Account Links.create
  //   refresh_url: `${_site}/?connect=refresh`
  //   return_url: `${_site}/?connect=success`
  // → { url }
  return jsonResponse({
    error: 'not_implemented',
    message: 'Connect onboarding not implemented yet — secrets present.',
  }, 501);
});
