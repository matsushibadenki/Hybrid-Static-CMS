alter table posts
  add column if not exists comments_policy text not null default 'inherit';

alter table series
  add column if not exists comments_enabled boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_comments_policy_check' and conrelid = 'posts'::regclass) then
    alter table posts add constraint posts_comments_policy_check
      check (comments_policy in ('inherit', 'enabled', 'disabled'));
  end if;
end
$$;

create table if not exists post_comments (
  id bigserial primary key,
  post_id bigint not null references posts(id) on delete cascade,
  author_name text not null,
  author_email text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  approved_by bigint references users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_comments_post_status_created_idx
  on post_comments (post_id, status, created_at, id);

create index if not exists post_comments_status_created_idx
  on post_comments (status, created_at desc, id desc);
