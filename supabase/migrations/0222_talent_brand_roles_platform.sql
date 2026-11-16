-- 0222: vai được xếp theo brand × SÀN. Dòng có sẵn từ 0221 giữ nguyên nghĩa = 'all' (cả hai sàn);
-- dòng theo sàn ('TikTok' / 'Shopee') thắng dòng 'all' khi xếp ca của sàn đó.
alter table talent_brand_roles add column if not exists platform text not null default 'all';
alter table talent_brand_roles drop constraint if exists talent_brand_roles_platform_check;
alter table talent_brand_roles add constraint talent_brand_roles_platform_check check (platform in ('all', 'TikTok', 'Shopee'));
alter table talent_brand_roles drop constraint if exists talent_brand_roles_talent_id_brand_id_key;
alter table talent_brand_roles drop constraint if exists talent_brand_roles_talent_brand_platform_key;
alter table talent_brand_roles add constraint talent_brand_roles_talent_brand_platform_key unique (talent_id, brand_id, platform);
