alter table media_files
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists media_variants (
  id bigserial primary key,
  media_id bigint not null references media_files(id) on delete cascade,
  kind text not null check (kind in ('display', 'thumbnail', 'responsive')),
  format text not null check (format in ('jpeg', 'png', 'webp', 'avif')),
  mime_type text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  size_bytes bigint not null check (size_bytes >= 0),
  stored_name text not null unique,
  public_url text not null,
  created_at timestamptz not null default now(),
  unique (media_id, kind, format)
);

create index if not exists media_variants_media_id_idx on media_variants(media_id);
