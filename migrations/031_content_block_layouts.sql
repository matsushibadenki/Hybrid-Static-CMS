alter table content_blocks
  add column if not exists layout_type text not null default 'plain';

alter table content_blocks
  drop constraint if exists content_blocks_layout_type_check;

alter table content_blocks
  add constraint content_blocks_layout_type_check
  check (layout_type in ('plain', 'feature', 'split', 'grid', 'notice'));
