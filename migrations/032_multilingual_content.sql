-- Keep legacy content at the existing English URLs while allowing translated
-- Japanese and Simplified Chinese records to reuse a slug in their own locale.
alter table posts
  add column if not exists content_locale text not null default 'en',
  add column if not exists translation_group uuid not null default gen_random_uuid();

alter table pages
  add column if not exists content_locale text not null default 'en',
  add column if not exists translation_group uuid not null default gen_random_uuid();

alter table posts drop constraint if exists posts_content_locale_check;
alter table posts add constraint posts_content_locale_check check (content_locale in ('en', 'ja', 'zh'));
alter table pages drop constraint if exists pages_content_locale_check;
alter table pages add constraint pages_content_locale_check check (content_locale in ('en', 'ja', 'zh'));

alter table posts drop constraint if exists posts_slug_key;
alter table pages drop constraint if exists pages_slug_key;

create unique index if not exists posts_content_locale_slug_idx on posts (content_locale, slug);
create unique index if not exists pages_content_locale_slug_idx on pages (content_locale, slug);
create index if not exists posts_translation_group_idx on posts (translation_group);
create index if not exists pages_translation_group_idx on pages (translation_group);
