-- ORVO global marketplace — optional client location on requests
-- Run after 001 → 002 → 003. Safe to re-run.

alter table public.requests
  add column if not exists location text;

comment on column public.requests.location is
  'Optional free-text country/region for the client (global marketplace).';
