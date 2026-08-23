/** Stripe SDK singleton for ORVO Edge Functions */
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';

let client: Stripe | null = null;

export function getStripe(secretKey: string): Stripe {
  if (!client) {
    client = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return client;
}
