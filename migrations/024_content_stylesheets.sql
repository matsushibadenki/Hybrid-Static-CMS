alter table categories
  add column if not exists stylesheet_path text;

alter table pages
  add column if not exists stylesheet_path text;

