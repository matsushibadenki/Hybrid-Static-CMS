create table if not exists pages (
  id bigserial primary key,
  title text not null,
  slug text not null unique,
  excerpt text,
  body_md text,
  body_html text not null default '',
  status text not null default 'draft',
  author_id bigint references users(id) on delete set null,
  published_at timestamptz,
  seo_title text,
  seo_description text,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_md, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pages_search_vector_idx on pages using gin (search_vector);
create index if not exists pages_status_published_at_idx on pages (status, published_at desc);
