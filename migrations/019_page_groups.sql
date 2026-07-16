create table if not exists page_groups (
  id bigserial primary key,
  title text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists page_group_members (
  page_id bigint primary key references pages(id) on delete cascade,
  group_id bigint not null references page_groups(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists page_group_members_group_position_idx on page_group_members (group_id, position, page_id);
