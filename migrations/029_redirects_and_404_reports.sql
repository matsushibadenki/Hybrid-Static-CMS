create table if not exists site_redirects (
  id bigserial primary key,
  source_path text not null unique,
  target_location text not null,
  status_code integer not null default 301,
  enabled boolean not null default true,
  automatic boolean not null default false,
  note text,
  hit_count bigint not null default 0,
  last_hit_at timestamptz,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_redirects_source_path_check check (
    left(source_path, 1) = '/'
    and length(source_path) between 1 and 2048
    and position('?' in source_path) = 0
    and position('#' in source_path) = 0
  ),
  constraint site_redirects_target_check check (length(target_location) between 1 and 4096),
  constraint site_redirects_status_check check (status_code in (301, 302, 307, 308)),
  constraint site_redirects_distinct_check check (source_path <> target_location)
);

create index if not exists site_redirects_enabled_source_idx
  on site_redirects (source_path) where enabled = true;
create index if not exists site_redirects_updated_at_idx
  on site_redirects (updated_at desc, id desc);

create table if not exists not_found_reports (
  id bigserial primary key,
  request_path text not null unique,
  hit_count bigint not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_referrer_origin text
);

create index if not exists not_found_reports_last_seen_idx
  on not_found_reports (last_seen_at desc, id desc);
create index if not exists not_found_reports_hit_count_idx
  on not_found_reports (hit_count desc, last_seen_at desc);
