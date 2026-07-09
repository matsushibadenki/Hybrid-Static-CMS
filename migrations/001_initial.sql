create extension if not exists pgcrypto;

create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists roles (
  id bigserial primary key,
  name text not null unique
);

create table if not exists user_roles (
  user_id bigint not null references users(id) on delete cascade,
  role_id bigint not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table if not exists sessions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id bigserial primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists tags (
  id bigserial primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists posts (
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

create index if not exists posts_search_vector_idx on posts using gin (search_vector);
create index if not exists posts_status_published_at_idx on posts (status, published_at desc);

create table if not exists post_categories (
  post_id bigint not null references posts(id) on delete cascade,
  category_id bigint not null references categories(id) on delete cascade,
  primary key (post_id, category_id)
);

create table if not exists post_tags (
  post_id bigint not null references posts(id) on delete cascade,
  tag_id bigint not null references tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create table if not exists settings (
  id bigserial primary key,
  key text not null unique,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into roles (name)
values
  ('owner'),
  ('admin'),
  ('editor'),
  ('author'),
  ('viewer'),
  ('ai_agent')
on conflict (name) do nothing;
