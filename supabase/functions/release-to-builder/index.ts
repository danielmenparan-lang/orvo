// Scaffold — release held funds to builder Connect account.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  if (!Deno.env.get('STRIPE_SECRET_KEY') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY, then implement Transfer.',
    }, 501);
  }

  // TODO: JWT owns request → payment held → Transfer → service-role released + completed
  return jsonResponse({
    error: 'not_implemented',
    message: 'Secrets present but release Transfer not implemented yet.',
  }, 501);
});
