create extension if not exists pg_trgm;

alter table posts
  add column if not exists search_text text generated always as (
    normalize(lower(
      coalesce(title, '') || ' ' ||
      coalesce(excerpt, '') || ' ' ||
      coalesce(body_md, '') || ' ' ||
      regexp_replace(coalesce(body_html, ''), '<[^>]+>', ' ', 'g')
    ), NFKC)
  ) stored;

create index if not exists posts_search_text_trgm_idx
  on posts using gin (search_text gin_trgm_ops);

alter table pages
  add column if not exists search_text text generated always as (
    normalize(lower(
      coalesce(title, '') || ' ' ||
      coalesce(excerpt, '') || ' ' ||
      coalesce(body_md, '') || ' ' ||
      regexp_replace(coalesce(body_html, ''), '<[^>]+>', ' ', 'g')
    ), NFKC)
  ) stored;

create index if not exists pages_search_text_trgm_idx
  on pages using gin (search_text gin_trgm_ops);

drop index if exists posts_search_vector_idx;
alter table posts drop column if exists search_vector;

drop index if exists pages_search_vector_idx;
alter table pages drop column if exists search_vector;
