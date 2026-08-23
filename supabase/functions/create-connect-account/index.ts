// Scaffold — Stripe Connect Express onboarding for builders.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  if (!Deno.env.get('STRIPE_SECRET_KEY')) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY, then create Express account + Account Link.',
    }, 501);
  }

  // TODO: verify JWT → create/retrieve Express account → Account Links.create → { url }
  return jsonResponse({
    error: 'not_implemented',
    message: 'Connect onboarding not implemented yet — secrets present.',
  }, 501);
});
