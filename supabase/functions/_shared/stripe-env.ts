/** Stripe env helpers for ORVO Edge Functions */
import { jsonResponse } from './cors.ts';

export function requireStripeSecret(): string | Response {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY in Edge Function secrets.',
    }, 501);
  }
  return key;
}

export function requireWebhookSecrets(): { stripeKey: string; whsec: string } | Response {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const whsec = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeKey || !whsec) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET before deploying.',
    }, 501);
  }
  return { stripeKey, whsec };
}

export function siteUrl(): string {
  return Deno.env.get('SITE_URL') || Deno.env.get('ORVO_APP_URL') || 'https://fantastic-eclair-0b2c66.netlify.app';
}

export function orvoFeePercent(): number {
  const raw = Deno.env.get('ORVO_FEE_PERCENT') ?? '0';
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function requireServiceRoleKey(): string | Response {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) {
    return jsonResponse({
      error: 'not_configured',
      message: 'Set SUPABASE_SERVICE_ROLE_KEY in Edge Function secrets.',
    }, 501);
  }
  return key;
}

export function requireCheckoutSecrets(): { stripeKey: string; serviceRole: string } | Response {
  const stripeKey = requireStripeSecret();
  if (stripeKey instanceof Response) return stripeKey;
  const serviceRole = requireServiceRoleKey();
  if (serviceRole instanceof Response) return serviceRole;
  return { stripeKey, serviceRole };
}

export function requireReleaseSecrets(): { stripeKey: string; serviceRole: string } | Response {
  return requireCheckoutSecrets();
}
