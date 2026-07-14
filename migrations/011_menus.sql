create table if not exists menus (
  id bigserial primary key,
  title text not null,
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_items (
  id bigserial primary key,
  menu_id bigint not null references menus(id) on delete cascade,
  label text not null,
  url text not null,
  open_new_tab boolean not null default false,
  sort_order integer not null default 0
);

create index if not exists menu_items_menu_id_idx on menu_items (menu_id, sort_order, id);
