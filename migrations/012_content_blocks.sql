create table if not exists content_blocks (
  id bigserial primary key,
  title text not null,
  slug text not null unique,
  body_html text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
