alter table public.profiles
  add column if not exists business_category text,
  add column if not exists business_model text,
  add column if not exists main_product text;

comment on column public.profiles.business_category is 'Kategori utama usaha untuk analisis produk dan pengembangan Sales Pouch.';
comment on column public.profiles.business_model is 'Model penjualan utama usaha untuk analisis produk dan pengembangan Sales Pouch.';
comment on column public.profiles.main_product is 'Produk utama yang dijual untuk analisis produk dan pengembangan Sales Pouch.';
