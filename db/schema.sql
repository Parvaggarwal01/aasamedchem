create extension if not exists pgcrypto;

create type app_role as enum ('admin', 'seller');
create type product_dimension as enum ('weight', 'volume', 'count');
create type quantity_unit as enum ('g', 'kg', 'mL', 'L', 'unit');
create type order_status as enum ('new', 'reviewing', 'approved', 'rejected');

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role app_role not null,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text not null,
  description text not null default '',
  dimension product_dimension not null,
  base_unit quantity_unit not null,
  stock_base_qty numeric(30, 12) not null check (stock_base_qty >= 0),
  price_per_base_unit_inr numeric(30, 12) not null check (price_per_base_unit_inr >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quotations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references users(id),
  customer_name text not null,
  status order_status not null default 'new',
  total_inr numeric(30, 12) not null default 0,
  created_at timestamptz not null default now()
);

create table quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  product_id uuid not null references products(id),
  ordered_qty numeric(30, 12) not null check (ordered_qty > 0),
  ordered_unit quantity_unit not null,
  base_qty numeric(30, 12) not null check (base_qty > 0),
  price_per_base_unit_inr numeric(30, 12) not null check (price_per_base_unit_inr >= 0),
  line_total_inr numeric(30, 12) not null check (line_total_inr >= 0)
);

create index quotations_seller_id_idx on quotations(seller_id);
create index quotation_lines_quotation_id_idx on quotation_lines(quotation_id);
create index products_category_idx on products(category);
