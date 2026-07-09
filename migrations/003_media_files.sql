create table if not exists media_files (
  id bigserial primary key,
  original_name text not null,
  stored_name text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  alt_text text,
  uploaded_by bigint references users(id) on delete set null,
  public_url text not null,
  created_at timestamptz not null default now()
);
