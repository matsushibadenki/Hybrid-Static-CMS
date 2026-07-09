alter table posts
  add column if not exists seo_noindex boolean not null default false,
  add column if not exists seo_nofollow boolean not null default false;

alter table pages
  add column if not exists seo_noindex boolean not null default false,
  add column if not exists seo_nofollow boolean not null default false;
