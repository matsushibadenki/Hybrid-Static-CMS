create table if not exists series (
  id bigserial primary key,
  title text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists post_series (
  post_id bigint primary key references posts(id) on delete cascade,
  series_id bigint not null references series(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_series_series_position_idx on post_series (series_id, position, post_id);
