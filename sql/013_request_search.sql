-- Optional search helper for browse jobs (client also uses ilike on title/description)

create extension if not exists pg_trgm;

alter table public.requests
  add column if not exists search_tsv tsvector;

create or replace function public.requests_search_tsv_update()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

drop trigger if exists trg_requests_search_tsv on public.requests;
create trigger trg_requests_search_tsv
  before insert or update of title, category, description
  on public.requests
  for each row execute function public.requests_search_tsv_update();

update public.requests set title = title where search_tsv is null;

create index if not exists requests_search_tsv_idx on public.requests using gin (search_tsv);
create index if not exists requests_title_trgm_idx on public.requests using gin (title gin_trgm_ops);

comment on column public.requests.search_tsv is 'Full-text search vector for browse jobs (optional)';
