# AasaMedChem Inventory Desk

A Next.js prototype for the AasaMedChem hackathon assignment. It demonstrates role-based inventory management, flexible unit ordering, INR quotation totals, and admin review of incoming quotations/orders.

## Features

- Seller/User panel for product search, category filtering, unit selection, and quotation placement.
- Admin panel for product creation, inventory review, product deletion, and order status review.
- Unit conversion across grams/kilograms, milliliters/liters, and item counts.
- INR pricing with line totals and quotation totals.
- Conversion details are shown in both seller and admin flows so reviewers can verify ordered quantities against stored base quantities.

## Tech Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- PostgreSQL on Neon for persistence
- Vercel for deployment

The app reads and writes products, quotations, and quotation line items through Server Actions backed by Neon PostgreSQL. If the database has no products yet, use `Load demo inventory` in the UI to insert sample records for conversion testing.

## High-Level Design

The browser renders the seller and admin panels from Next.js. Server Actions in `app/actions.ts` validate inputs, convert requested quantities into base units, calculate INR totals, and write records to Neon PostgreSQL through `lib/db.ts`. Vercel hosts the Next.js app and stores the Neon connection string in encrypted environment variables.

## Authentication and Roles

The app uses email/password authentication with signed HTTP-only session cookies:

- Admin: inventory and incoming quotation/order management.
- Seller/User: product discovery and quotation placement.

Seller registration is open from the UI. Admin registration requires `ADMIN_INVITE_CODE` after the first admin exists. To avoid setup deadlock, the first admin account can be registered without an invite code when there are no admins in the database.

Test credentials:

- Admin: `admin@test.com` / `admin@123#`
- Seller/User: `parvaggarwal130@gmail.com` / `Parv@1122`

Passwords are stored as PBKDF2-SHA256 hashes. Do not commit real credentials.

## Database Schema

Use `numeric` for prices, quantities, and conversion factors because medicinal chemistry inventory can involve very small decimal quantities and very large stock or quotation values. PostgreSQL `numeric(30, 12)` supports high precision without floating point rounding drift.

```sql
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
```

## Unit Storage and Conversion Strategy

Store every product in one canonical base unit:

- Weight products: base unit `g`
- Volume products: base unit `mL`
- Count products: base unit `unit`

Supported conversion factors:

- `1 kg = 1000 g`
- `1 L = 1000 mL`
- `1 unit = 1 unit`

Examples:

- Product rate: Atorvastatin Calcium costs INR 18.25 per `g`.
- Seller orders `0.25 kg`.
- App converts `0.25 kg * 1000 = 250 g`.
- Line total is `250 * 18.25 = INR 4,562.50`.

Conversions are applied before persistence and before pricing:

1. Validate the requested unit is compatible with the product dimension.
2. Convert requested quantity into the product base unit.
3. Multiply base quantity by `price_per_base_unit_inr`.
4. Store the original ordered quantity/unit and the converted base quantity for auditability.
5. Display both ordered and base quantities in the admin review panel.

## Local Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For a Neon-backed implementation, copy `.env.example` to `.env.local` and fill in the real values:

```bash
cp .env.example .env.local
```

Never commit `.env.local` or real secrets.

## Vercel Deployment

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Add `DATABASE_URL`, `AUTH_SECRET`, and `ADMIN_INVITE_CODE` in Vercel Project Settings.
4. Connect the Neon database and run the schema migration.
5. Deploy with the default Next.js build command:

```bash
npm run build
```

## How to Use

Seller/User flow:

1. Log in as the Seller/User test account.
2. Search or filter products.
3. Add products to the quotation.
4. Enter quantities in any supported compatible unit.
5. Review the displayed base-unit conversion and INR total.
6. Place the quotation.

Admin flow:

1. Log in as the Admin test account.
2. Review inventory levels and alternate unit displays.
3. Add or delete products.
4. Review incoming quotations/orders.
5. Compare ordered units, stored base quantities, line totals, and quotation totals.
6. Update quotation status.
