-- SubShield cloud schema (optional — run in Supabase SQL editor when ready)
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'solo',
  created_at timestamptz default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists subcontractors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  company_name text not null,
  contact_email text,
  carrier text,
  expires_on date,
  file_path text,
  created_at timestamptz default now()
);

create index if not exists subcontractors_expires_idx on subcontractors (expires_on);
