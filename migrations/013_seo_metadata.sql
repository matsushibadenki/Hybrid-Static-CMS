alter table posts
  add column if not exists seo_canonical_url text,
  add column if not exists seo_og_image text,
  add column if not exists seo_keywords text;

alter table pages
  add column if not exists seo_canonical_url text,
  add column if not exists seo_og_image text,
  add column if not exists seo_keywords text;
