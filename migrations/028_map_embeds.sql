create table if not exists map_embeds (
  id bigint generated always as identity primary key,
  title text not null,
  slug text not null unique,
  provider text not null default 'openstreetmap' check (provider in ('openstreetmap', 'google')),
  display_mode text not null default 'marker' check (display_mode in ('marker', 'route')),
  start_lat double precision not null check (start_lat between -90 and 90),
  start_lng double precision not null check (start_lng between -180 and 180),
  start_label text not null default '',
  end_lat double precision check (end_lat between -90 and 90),
  end_lng double precision check (end_lng between -180 and 180),
  end_label text not null default '',
  travel_mode text not null default 'driving' check (travel_mode in ('driving', 'walking', 'bicycling', 'transit')),
  zoom smallint not null default 14 check (zoom between 0 and 21),
  height smallint not null default 480 check (height between 200 and 1000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (display_mode = 'marker' or (end_lat is not null and end_lng is not null))
);

create index if not exists map_embeds_status_updated_idx
  on map_embeds (status, updated_at desc, id desc);
