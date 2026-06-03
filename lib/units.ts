import type { Dimension, Unit } from "@/lib/types";

export const supportedUnits: Record<Dimension, Unit[]> = {
  weight: ["g", "kg"],
  volume: ["mL", "L"],
  count: ["unit"],
};

export function baseUnitForDimension(dimension: Dimension): Unit {
  if (dimension === "weight") {
    return "g";
  }

  if (dimension === "volume") {
    return "mL";
  }

  return "unit";
}

export function isUnitCompatible(unit: Unit, dimension: Dimension) {
  return supportedUnits[dimension].includes(unit);
}

export function toBaseQuantity(quantity: number, fromUnit: Unit, dimension: Dimension) {
  if (!isUnitCompatible(fromUnit, dimension)) {
    throw new Error(`Unit ${fromUnit} is not compatible with ${dimension}`);
  }

  if (dimension === "weight") {
    return fromUnit === "kg" ? quantity * 1000 : quantity;
  }

  if (dimension === "volume") {
    return fromUnit === "L" ? quantity * 1000 : quantity;
  }

  return quantity;
}

export function fromBaseQuantity(quantity: number, toUnit: Unit, dimension: Dimension) {
  if (!isUnitCompatible(toUnit, dimension)) {
    throw new Error(`Unit ${toUnit} is not compatible with ${dimension}`);
  }

  if (dimension === "weight") {
    return toUnit === "kg" ? quantity / 1000 : quantity;
  }

  if (dimension === "volume") {
    return toUnit === "L" ? quantity / 1000 : quantity;
  }

  return quantity;
}
