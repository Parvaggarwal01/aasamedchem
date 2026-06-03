"use server";

import { revalidatePath } from "next/cache";
import { createSession, destroySession, getSession, hashPassword, requireRole, requireSession, verifyPassword } from "@/lib/auth";
import { sql } from "@/lib/db";
import { calculateLine } from "@/lib/pricing";
import type {
  CartLine,
  Dimension,
  LoginInput,
  Order,
  OrderStatus,
  Product,
  ProductInput,
  RegisterInput,
  Role,
  Unit,
  UserSession,
} from "@/lib/types";
import { baseUnitForDimension, isUnitCompatible } from "@/lib/units";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  dimension: Dimension;
  base_unit: Unit;
  stock_base_qty: string;
  price_per_base_unit_inr: string;
};

type OrderRow = {
  id: string;
  customer_name: string;
  status: OrderStatus;
  created_at: string;
  total_inr: string;
};

type OrderLineRow = {
  quotation_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  ordered_qty: string;
  ordered_unit: Unit;
  base_qty: string;
  line_total_inr: string;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
};

const demoProducts: ProductInput[] = [
  {
    sku: "API-ATOR-001",
    name: "Atorvastatin Calcium",
    category: "API",
    dimension: "weight",
    stockBaseQty: 25000,
    priceRupees: 18.25,
    description: "High-purity active ingredient, stored and priced per gram.",
  },
  {
    sku: "SOLV-ETH-005",
    name: "Ethanol 99.9%",
    category: "Solvent",
    dimension: "volume",
    stockBaseQty: 180000,
    priceRupees: 0.64,
    description: "Analytical grade solvent with milliliter base inventory.",
  },
  {
    sku: "PACK-VIAL-010",
    name: "Amber Glass Vial",
    category: "Packaging",
    dimension: "count",
    stockBaseQty: 4200,
    priceRupees: 12.99,
    description: "20 mL amber vial, counted and priced per item.",
  },
  {
    sku: "BUF-PH7-100",
    name: "Phosphate Buffer pH 7.4",
    category: "Buffer",
    dimension: "volume",
    stockBaseQty: 64000,
    priceRupees: 0.31,
    description: "Ready-to-use buffer, orderable in mL or L.",
  },
];

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    description: row.description,
    dimension: row.dimension,
    baseUnit: row.base_unit,
    stockBaseQty: Number(row.stock_base_qty),
    pricePerBaseUnitPaise: Math.round(Number(row.price_per_base_unit_inr) * 100),
  };
}

function inrToPaise(value: string) {
  return Math.round(Number(value) * 100);
}

function assertPositiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!normalized.includes("@")) {
    throw new Error("Enter a valid email address");
  }

  return normalized;
}

function toPublicSession(row: Pick<UserRow, "id" | "email" | "role">): UserSession {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
  };
}

export async function getSessionAction() {
  return getSession();
}

export async function registerAction(input: RegisterInput) {
  const email = normalizeEmail(input.email);
  const role = input.role;

  if (role === "admin") {
    const expectedInviteCode = process.env.ADMIN_INVITE_CODE;
    const [adminCount] = (await sql`
      select count(*)::int as count
      from users
      where role = 'admin'
    `) as Array<{ count: number }>;

    if (adminCount.count > 0 && (!expectedInviteCode || input.adminInviteCode !== expectedInviteCode)) {
      throw new Error("Valid admin invite code is required");
    }
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const [user] = (await sql`
      insert into users (email, password_hash, role)
      values (${email}, ${passwordHash}, ${role})
      returning id, email, role
    `) as Array<Pick<UserRow, "id" | "email" | "role">>;

    const session = toPublicSession(user);
    await createSession(session);
    revalidatePath("/");
    return session;
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate key")) {
      throw new Error("An account with this email already exists");
    }

    throw error;
  }
}

export async function loginAction(input: LoginInput) {
  const email = normalizeEmail(input.email);
  const [user] = (await sql`
    select id, email, password_hash, role
    from users
    where email = ${email}
    limit 1
  `) as UserRow[];

  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    throw new Error("Invalid email or password");
  }

  const session = toPublicSession(user);
  await createSession(session);
  revalidatePath("/");
  return session;
}

export async function logoutAction() {
  await destroySession();
  revalidatePath("/");
}

export async function getDashboardDataAction() {
  const session = await requireSession();
  const productRows = (await sql`
      select id, sku, name, category, description, dimension, base_unit, stock_base_qty, price_per_base_unit_inr
      from products
      order by created_at desc, name asc
    `) as ProductRow[];

  const orderRows =
    session.role === "admin"
      ? ((await sql`
      select id, customer_name, status, created_at::text, total_inr
      from quotations
      order by created_at desc
    `) as OrderRow[])
      : ((await sql`
      select id, customer_name, status, created_at::text, total_inr
      from quotations
      where seller_id = ${session.id}
      order by created_at desc
    `) as OrderRow[]);

  const lineRows =
    orderRows.length === 0
      ? []
      : ((await sql`
      select
        ql.quotation_id,
        ql.product_id,
        p.name as product_name,
        p.sku,
        ql.ordered_qty,
        ql.ordered_unit,
        ql.base_qty,
        ql.line_total_inr
      from quotation_lines ql
      join products p on p.id = ql.product_id
      where ql.quotation_id = any(${orderRows.map((row) => row.id)})
      order by ql.id asc
    `) as OrderLineRow[]);

  const linesByOrder = new Map<string, Order["lines"]>();

  for (const row of lineRows) {
    const lines = linesByOrder.get(row.quotation_id) ?? [];
    lines.push({
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      quantity: Number(row.ordered_qty),
      unit: row.ordered_unit,
      baseQuantity: Number(row.base_qty),
      lineTotalPaise: inrToPaise(row.line_total_inr),
    });
    linesByOrder.set(row.quotation_id, lines);
  }

  return {
    products: productRows.map(toProduct),
    orders: orderRows.map((row) => ({
      id: row.id,
      customer: row.customer_name,
      status: row.status,
      createdAt: row.created_at.slice(0, 10),
      totalPaise: inrToPaise(row.total_inr),
      lines: linesByOrder.get(row.id) ?? [],
    })),
  };
}

export async function createProductAction(input: ProductInput) {
  await requireRole("admin");
  assertPositiveNumber(input.stockBaseQty, "Stock");
  assertPositiveNumber(input.priceRupees, "Price");

  const baseUnit = baseUnitForDimension(input.dimension);

  await sql`
    insert into products (
      sku,
      name,
      category,
      description,
      dimension,
      base_unit,
      stock_base_qty,
      price_per_base_unit_inr
    )
    values (
      ${input.sku.trim()},
      ${input.name.trim()},
      ${input.category.trim()},
      ${input.description.trim()},
      ${input.dimension},
      ${baseUnit},
      ${input.stockBaseQty},
      ${input.priceRupees}
    )
  `;

  revalidatePath("/");
}

export async function deleteProductAction(productId: string) {
  await requireRole("admin");
  await sql`delete from products where id = ${productId}`;
  revalidatePath("/");
}

export async function updateOrderStatusAction(orderId: string, status: OrderStatus) {
  await requireRole("admin");
  await sql`update quotations set status = ${status} where id = ${orderId}`;
  revalidatePath("/");
}

export async function createQuotationAction(customer: string, lines: CartLine[]) {
  const session = await requireSession();

  if (!customer.trim()) {
    throw new Error("Customer is required");
  }

  if (lines.length === 0) {
    throw new Error("Quotation must include at least one product");
  }

  const productRows = (await sql`
    select id, sku, name, category, description, dimension, base_unit, stock_base_qty, price_per_base_unit_inr
    from products
  `) as ProductRow[];
  const products = new Map(productRows.map((row) => [row.id, toProduct(row)]));

  const pricedLines = lines.map((line) => {
    const product = products.get(line.productId);

    if (!product) {
      throw new Error("Product no longer exists");
    }

    assertPositiveNumber(line.quantity, "Quantity");

    if (!isUnitCompatible(line.unit, product.dimension)) {
      throw new Error(`${line.unit} is not valid for ${product.name}`);
    }

    const calculated = calculateLine(product, line.quantity, line.unit);

    return {
      ...line,
      product,
      baseQuantity: calculated.baseQuantity,
      lineTotalInr: calculated.lineTotalPaise / 100,
      pricePerBaseUnitInr: product.pricePerBaseUnitPaise / 100,
    };
  });

  const totalInr = pricedLines.reduce((total, line) => total + line.lineTotalInr, 0);
  const [quotation] = (await sql`
    insert into quotations (seller_id, customer_name, status, total_inr)
    values (${session.id}, ${customer.trim()}, 'new', ${totalInr})
    returning id
  `) as Array<{ id: string }>;

  for (const line of pricedLines) {
    await sql`
      insert into quotation_lines (
        quotation_id,
        product_id,
        ordered_qty,
        ordered_unit,
        base_qty,
        price_per_base_unit_inr,
        line_total_inr
      )
      values (
        ${quotation.id},
        ${line.productId},
        ${line.quantity},
        ${line.unit},
        ${line.baseQuantity},
        ${line.pricePerBaseUnitInr},
        ${line.lineTotalInr}
      )
    `;
  }

  revalidatePath("/");
}

export async function seedDemoDataAction() {
  await requireRole("admin");

  for (const product of demoProducts) {
    const baseUnit = baseUnitForDimension(product.dimension);
    await sql`
      insert into products (
        sku,
        name,
        category,
        description,
        dimension,
        base_unit,
        stock_base_qty,
        price_per_base_unit_inr
      )
      values (
        ${product.sku},
        ${product.name},
        ${product.category},
        ${product.description},
        ${product.dimension},
        ${baseUnit},
        ${product.stockBaseQty},
        ${product.priceRupees}
      )
      on conflict (sku) do nothing
    `;
  }

  revalidatePath("/");
}
