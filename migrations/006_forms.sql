create table if not exists forms (
  id bigserial primary key,
  title text not null,
  slug text not null unique,
  description text,
  status text not null default 'draft',
  submit_label text not null default 'Send',
  success_message text not null default 'Thank you. Your submission has been received.',
  author_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists form_fields (
  id bigserial primary key,
  form_id bigint not null references forms(id) on delete cascade,
  name text not null,
  label text not null,
  field_type text not null,
  required boolean not null default false,
  options_json jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0
);

create table if not exists form_submissions (
  id bigserial primary key,
  form_id bigint not null references forms(id) on delete cascade,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists form_fields_form_id_idx on form_fields (form_id, sort_order);
create index if not exists form_submissions_form_id_idx on form_submissions (form_id, created_at desc);
