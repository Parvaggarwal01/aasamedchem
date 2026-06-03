import type { Product, Unit } from "@/lib/types";
import { toBaseQuantity } from "@/lib/units";

export function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function formatQty(quantity: number, unit: Unit) {
  return `${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 4,
  }).format(quantity)} ${unit}`;
}

export function calculateLine(product: Product, quantity: number, unit: Unit) {
  const baseQuantity = toBaseQuantity(quantity, unit, product.dimension);

  return {
    baseQuantity,
    lineTotalPaise: Math.round(baseQuantity * product.pricePerBaseUnitPaise),
  };
}
