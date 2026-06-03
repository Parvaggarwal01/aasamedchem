export type Role = "admin" | "seller";
export type Unit = "g" | "kg" | "mL" | "L" | "unit";
export type Dimension = "weight" | "volume" | "count";
export type OrderStatus = "new" | "reviewing" | "approved" | "rejected";

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  dimension: Dimension;
  baseUnit: Unit;
  stockBaseQty: number;
  pricePerBaseUnitPaise: number;
  description: string;
};

export type CartLine = {
  productId: string;
  quantity: number;
  unit: Unit;
};

export type OrderLine = CartLine & {
  productName: string;
  sku: string;
  baseQuantity: number;
  lineTotalPaise: number;
};

export type Order = {
  id: string;
  customer: string;
  status: OrderStatus;
  createdAt: string;
  lines: OrderLine[];
  totalPaise: number;
};

export type ProductInput = {
  sku: string;
  name: string;
  category: string;
  dimension: Dimension;
  stockBaseQty: number;
  priceRupees: number;
  description: string;
};
