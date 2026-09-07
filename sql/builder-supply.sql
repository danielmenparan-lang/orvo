-- ORVO Builder Supply — run in Supabase SQL Editor after revenue-engine.sql

-- Public directory fields on profiles
alter table public.profiles
  add column if not exists headline text,
  add column if not exists specialties text,
  add column if not exists public_bio text,
  add column if not exists demo_url text,
  add column if not exists show_in_directory boolean default false,
  add column if not exists invite_code_used text;

-- Builder applications: invite + demo
alter table public.builder_applications
  add column if not exists invite_code text,
  add column if not exists demo_url text,
  add column if not exists specialties text,
  add column if not exists why_orvo text;

-- Invite codes (admin generates, builders redeem on apply)
create table if not exists public.builder_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  note text,
  max_uses int not null default 1,
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.builder_invites enable row level security;

drop policy if exists "invites_select_authenticated" on public.builder_invites;
create policy "invites_select_authenticated" on public.builder_invites
  for select to authenticated using (true);

drop policy if exists "invites_insert_admin" on public.builder_invites;
-- Admins insert via client; tighten later with is_admin claim if needed
create policy "invites_insert_authenticated" on public.builder_invites
  for insert to authenticated with check (true);

drop policy if exists "invites_update_authenticated" on public.builder_invites;
create policy "invites_update_authenticated" on public.builder_invites
  for update to authenticated using (true);

-- Ready-made agent templates (catalog clients can request)
create table if not exists public.agent_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  summary text not null,
  budget_hint text,
  skills text,
  featured boolean default true,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

alter table public.agent_templates enable row level security;

drop policy if exists "templates_public_read" on public.agent_templates;
create policy "templates_public_read" on public.agent_templates
  for select to anon, authenticated using (active = true);

drop policy if exists "templates_admin_write" on public.agent_templates;
create policy "templates_admin_write" on public.agent_templates
  for all to authenticated using (true) with check (true);

-- Public read of approved builders who opted into directory
-- (profiles usually blocked by RLS — add a narrow policy)
drop policy if exists "profiles_directory_public" on public.profiles;
create policy "profiles_directory_public" on public.profiles
  for select to anon, authenticated
  using (builder_status = 'approved' and show_in_directory = true);

create index if not exists profiles_directory_idx
  on public.profiles (builder_status, show_in_directory)
  where builder_status = 'approved' and show_in_directory = true;

create index if not exists builder_invites_code_idx on public.builder_invites (code);

-- Seed ready agents (idempotent)
insert into public.agent_templates (slug, title, category, summary, budget_hint, skills, sort_order)
values
  ('whatsapp-restaurant', 'WhatsApp order bot for restaurants', 'WhatsApp / Chat',
   'Takes orders on WhatsApp, answers menu questions, alerts the kitchen.', '$800–$2,500',
   'WhatsApp API, n8n, GPT', 10),
  ('voice-clinic', 'Voice receptionist for clinics', 'Voice / Phone',
   'Answers calls, books appointments, routes emergencies to staff.', '$1,500–$4,000',
   'Twilio, Voice AI, Calendar', 20),
  ('lead-qualifier', 'CRM lead qualifier', 'CRM / Email',
   'Scores inbound leads, follows up by email/SMS, syncs to CRM.', '$1,000–$3,000',
   'HubSpot, Make, GPT', 30),
  ('support-rag', 'Support agent with your docs', 'Automation',
   'Answers customer questions from your knowledge base 24/7.', '$1,200–$3,500',
   'RAG, Supabase, Slack', 40),
  ('invoice-chaser', 'Invoice follow-up agent', 'Automation',
   'Reminds clients about unpaid invoices politely until paid.', '$700–$2,000',
   'n8n, Stripe, Email', 50),
  ('social-publisher', 'Social content publisher', 'Other',
   'Turns blog posts into scheduled multi-platform social drafts.', '$600–$1,800',
   'Buffer API, GPT, Notion', 60)
on conflict (slug) do update set
  title = excluded.title,
  summary = excluded.summary,
  budget_hint = excluded.budget_hint,
  skills = excluded.skills,
  active = true;
