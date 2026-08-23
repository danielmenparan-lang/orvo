/** Supabase clients for ORVO Edge Functions */
import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

function projectUrl(): string {
  return Deno.env.get('SUPABASE_URL') || '';
}

function anonKey(): string {
  return Deno.env.get('SUPABASE_ANON_KEY') || '';
}

export function createServiceClient(serviceRole: string) {
  return createClient(projectUrl(), serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createUserClient(authHeader: string) {
  return createClient(projectUrl(), anonKey(), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  if (!projectUrl() || !anonKey()) return null;
  try {
    const client = createUserClient(auth);
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}
