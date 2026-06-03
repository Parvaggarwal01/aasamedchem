"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  createProductAction,
  createQuotationAction,
  deleteProductAction,
  getDashboardDataAction,
  seedDemoDataAction,
  updateOrderStatusAction,
} from "@/app/actions";
import { calculateLine, formatInr, formatQty } from "@/lib/pricing";
import type { CartLine, Dimension, Order, OrderStatus, Product, ProductInput, Role, Unit } from "@/lib/types";
import { fromBaseQuantity, supportedUnits } from "@/lib/units";

export default function Home() {
  const [role, setRole] = useState<Role>("seller");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("Aasa Demo Labs");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  async function refreshDashboard() {
    setError("");
    const data = await getDashboardDataAction();
    setProducts(data.products);
    setOrders(data.orders);
    setIsLoading(false);
  }

  useEffect(() => {
    // Initial hydration comes from Neon through a Server Action.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshDashboard().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to load database data");
      setIsLoading(false);
    });
  }, []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((product) => product.category)))],
    [products],
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesQuery =
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.sku.toLowerCase().includes(normalizedQuery);
      const matchesCategory = category === "All" || product.category === category;

      return matchesQuery && matchesCategory;
    });
  }, [category, products, query]);

  const cartPreview = useMemo(() => {
    const lines = cart
      .map((line) => {
        const product = products.find((item) => item.id === line.productId);

        if (!product || line.quantity <= 0) {
          return null;
        }

        const pricedLine = calculateLine(product, line.quantity, line.unit);

        return {
          ...line,
          ...pricedLine,
          product,
        };
      })
      .filter(Boolean) as Array<CartLine & { product: Product; baseQuantity: number; lineTotalPaise: number }>;

    return {
      lines,
      totalPaise: lines.reduce((total, line) => total + line.lineTotalPaise, 0),
    };
  }, [cart, products]);

  function runMutation(task: () => Promise<void>) {
    setError("");
    startTransition(async () => {
      try {
        await task();
        await refreshDashboard();
      } catch (mutationError) {
        setError(mutationError instanceof Error ? mutationError.message : "Request failed");
      }
    });
  }

  function addProductToCart(product: Product) {
    const defaultUnit = supportedUnits[product.dimension][0];

    setCart((current) => {
      if (current.some((line) => line.productId === product.id)) {
        return current;
      }

      return [...current, { productId: product.id, quantity: 1, unit: defaultUnit }];
    });
  }

  function updateCartLine(productId: string, changes: Partial<CartLine>) {
    setCart((current) =>
      current.map((line) => (line.productId === productId ? { ...line, ...changes } : line)),
    );
  }

  function placeQuotation() {
    if (cartPreview.lines.length === 0) {
      return;
    }

    runMutation(async () => {
      await createQuotationAction(customer, cart);
      setCart([]);
      setRole("admin");
    });
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dimension = form.get("dimension") as Dimension;
    const input: ProductInput = {
      sku: String(form.get("sku")),
      name: String(form.get("name")),
      category: String(form.get("category")),
      dimension,
      stockBaseQty: Number(form.get("stockBaseQty")),
      priceRupees: Number(form.get("priceRupees")),
      description: String(form.get("description")),
    };

    runMutation(async () => {
      await createProductAction(input);
      event.currentTarget.reset();
    });
  }

  return (
    <main className="min-h-screen bg-[#f7f3ea] text-[#17201b]">
      <section className="border-b border-[#d7cec0] bg-[#19403c] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-8 md:flex-row md:items-end md:justify-between lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f0c46b]">
              AasaMedChem assignment
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-6xl">
              Inventory, unit conversion, and quotation desk
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#dce8e3]">
              A Neon-backed role-based prototype for sellers to prepare INR quotations and admins
              to validate stock, base-unit conversions, pricing, and incoming order details.
            </p>
          </div>

          <div className="flex w-full max-w-sm rounded-md border border-white/20 bg-white/10 p-1">
            {(["seller", "admin"] as Role[]).map((option) => (
              <button
                key={option}
                className={`h-11 flex-1 rounded-[4px] text-sm font-semibold capitalize transition ${
                  role === option ? "bg-white text-[#19403c]" : "text-white hover:bg-white/10"
                }`}
                onClick={() => setRole(option)}
                type="button"
              >
                {option === "seller" ? "Seller/User" : "Admin"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-5 lg:px-8">
        {error ? (
          <div className="rounded-md border border-[#d99b8d] bg-[#fff4f1] px-4 py-3 text-sm font-medium text-[#8f2f1f]">
            {error}
          </div>
        ) : null}
        {isLoading || isPending ? (
          <div className="mt-3 rounded-md border border-[#d7cec0] bg-white px-4 py-3 text-sm text-[#66706b]">
            {isLoading ? "Loading inventory from Neon..." : "Saving changes..."}
          </div>
        ) : null}
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div className="space-y-6">
          {role === "seller" ? (
            <SellerPanel
              categories={categories}
              category={category}
              filteredProducts={filteredProducts}
              onAddProduct={addProductToCart}
              onCategoryChange={setCategory}
              onQueryChange={setQuery}
              onSeedDemo={() => runMutation(seedDemoDataAction)}
              products={products}
              query={query}
            />
          ) : (
            <AdminPanel
              onCreateProduct={saveProduct}
              onDeleteProduct={(productId) => runMutation(() => deleteProductAction(productId))}
              onSeedDemo={() => runMutation(seedDemoDataAction)}
              onUpdateOrderStatus={(orderId, status) =>
                runMutation(() => updateOrderStatusAction(orderId, status))
              }
              orders={orders}
              products={products}
            />
          )}
        </div>

        <QuotationPanel
          cart={cart}
          cartPreview={cartPreview}
          customer={customer}
          onCustomerChange={setCustomer}
          onPlaceQuotation={placeQuotation}
          onRemoveLine={(productId) =>
            setCart((current) => current.filter((item) => item.productId !== productId))
          }
          onUpdateLine={updateCartLine}
          products={products}
        />
      </section>
    </main>
  );
}

function SellerPanel({
  categories,
  category,
  filteredProducts,
  onAddProduct,
  onCategoryChange,
  onQueryChange,
  onSeedDemo,
  products,
  query,
}: {
  categories: string[];
  category: string;
  filteredProducts: Product[];
  onAddProduct: (product: Product) => void;
  onCategoryChange: (category: string) => void;
  onQueryChange: (query: string) => void;
  onSeedDemo: () => void;
  products: Product[];
  query: string;
}) {
  if (products.length === 0) {
    return <EmptyInventory onSeedDemo={onSeedDemo} />;
  }

  return (
    <>
      <div className="grid gap-3 rounded-md border border-[#d7cec0] bg-white p-4 md:grid-cols-[1fr_220px]">
        <label className="text-sm font-medium text-[#56615d]">
          Search products
          <input
            className="mt-2 h-11 w-full rounded-md border border-[#c9c0b4] px-3 text-base text-[#17201b] outline-none focus:border-[#24786f]"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by product name or SKU"
            value={query}
          />
        </label>
        <label className="text-sm font-medium text-[#56615d]">
          Category
          <select
            className="mt-2 h-11 w-full rounded-md border border-[#c9c0b4] bg-white px-3 text-base text-[#17201b] outline-none focus:border-[#24786f]"
            onChange={(event) => onCategoryChange(event.target.value)}
            value={category}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredProducts.map((product) => (
          <article className="rounded-md border border-[#d7cec0] bg-white p-5 shadow-sm" key={product.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9b5f22]">
                  {product.category}
                </p>
                <h2 className="mt-2 text-xl font-semibold">{product.name}</h2>
                <p className="mt-1 text-sm text-[#66706b]">{product.sku}</p>
              </div>
              <button
                className="h-10 rounded-md bg-[#19403c] px-4 text-sm font-semibold text-white hover:bg-[#23554f]"
                onClick={() => onAddProduct(product)}
                type="button"
              >
                Add
              </button>
            </div>
            <p className="mt-4 min-h-12 text-sm leading-6 text-[#4b5651]">{product.description}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#eee6da] pt-4 text-sm">
              <div>
                <span className="block text-[#66706b]">Base price</span>
                <strong>{formatInr(product.pricePerBaseUnitPaise)}</strong>
                <span className="text-[#66706b]"> / {product.baseUnit}</span>
              </div>
              <div>
                <span className="block text-[#66706b]">Available stock</span>
                <strong>{formatQty(product.stockBaseQty, product.baseUnit)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function QuotationPanel({
  cart,
  cartPreview,
  customer,
  onCustomerChange,
  onPlaceQuotation,
  onRemoveLine,
  onUpdateLine,
  products,
}: {
  cart: CartLine[];
  cartPreview: {
    lines: Array<CartLine & { product: Product; baseQuantity: number; lineTotalPaise: number }>;
    totalPaise: number;
  };
  customer: string;
  onCustomerChange: (customer: string) => void;
  onPlaceQuotation: () => void;
  onRemoveLine: (productId: string) => void;
  onUpdateLine: (productId: string, changes: Partial<CartLine>) => void;
  products: Product[];
}) {
  return (
    <aside className="h-fit rounded-md border border-[#d7cec0] bg-white p-5 shadow-sm lg:sticky lg:top-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Quotation</h2>
        <span className="rounded-[4px] bg-[#f0c46b]/30 px-2 py-1 text-xs font-semibold text-[#72480d]">
          INR
        </span>
      </div>

      <label className="mt-5 block text-sm font-medium text-[#56615d]">
        Customer
        <input
          className="mt-2 h-11 w-full rounded-md border border-[#c9c0b4] px-3 text-base text-[#17201b] outline-none focus:border-[#24786f]"
          onChange={(event) => onCustomerChange(event.target.value)}
          value={customer}
        />
      </label>

      <div className="mt-5 space-y-4">
        {cart.length === 0 ? (
          <p className="rounded-md border border-dashed border-[#c9c0b4] p-4 text-sm leading-6 text-[#66706b]">
            Add products from the seller panel to build a quotation.
          </p>
        ) : (
          cart.map((line) => {
            const product = products.find((item) => item.id === line.productId);

            if (!product) {
              return null;
            }

            const calculated = calculateLine(product, line.quantity, line.unit);

            return (
              <div className="rounded-md border border-[#eee6da] p-3" key={line.productId}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-xs text-[#66706b]">{product.sku}</p>
                  </div>
                  <button
                    className="text-sm font-semibold text-[#9b2f24] hover:text-[#6f1f18]"
                    onClick={() => onRemoveLine(line.productId)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_92px] gap-2">
                  <input
                    className="h-10 rounded-md border border-[#c9c0b4] px-3 outline-none focus:border-[#24786f]"
                    min="0"
                    onChange={(event) =>
                      onUpdateLine(line.productId, { quantity: Number(event.target.value) })
                    }
                    step="0.0001"
                    type="number"
                    value={line.quantity}
                  />
                  <select
                    className="h-10 rounded-md border border-[#c9c0b4] bg-white px-2 outline-none focus:border-[#24786f]"
                    onChange={(event) =>
                      onUpdateLine(line.productId, { unit: event.target.value as Unit })
                    }
                    value={line.unit}
                  >
                    {supportedUnits[product.dimension].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 rounded-[4px] bg-[#eef5f3] p-3 text-sm text-[#33413c]">
                  <div className="flex justify-between gap-3">
                    <span>Stored as</span>
                    <strong>{formatQty(calculated.baseQuantity, product.baseUnit)}</strong>
                  </div>
                  <div className="mt-1 flex justify-between gap-3">
                    <span>Line total</span>
                    <strong>{formatInr(calculated.lineTotalPaise)}</strong>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-5 border-t border-[#eee6da] pt-5">
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Total</span>
          <span>{formatInr(cartPreview.totalPaise)}</span>
        </div>
        <button
          className="mt-4 h-12 w-full rounded-md bg-[#b8492a] px-4 font-semibold text-white hover:bg-[#993d25] disabled:cursor-not-allowed disabled:bg-[#d8b8ae]"
          disabled={cartPreview.lines.length === 0}
          onClick={onPlaceQuotation}
          type="button"
        >
          Place quotation
        </button>
      </div>
    </aside>
  );
}

function AdminPanel({
  onCreateProduct,
  onDeleteProduct,
  onSeedDemo,
  onUpdateOrderStatus,
  orders,
  products,
}: {
  onCreateProduct: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteProduct: (productId: string) => void;
  onSeedDemo: () => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
  orders: Order[];
  products: Product[];
}) {
  return (
    <div className="space-y-6">
      {products.length === 0 ? <EmptyInventory onSeedDemo={onSeedDemo} /> : null}

      <section className="rounded-md border border-[#d7cec0] bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Admin inventory</h2>
        <p className="mt-2 text-sm leading-6 text-[#66706b]">
          Products store stock and rates in base units: grams for weight, milliliters for volume,
          and unit counts for items.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#d7cec0] text-xs uppercase tracking-[0.12em] text-[#66706b]">
                <th className="py-3 pr-4">Product</th>
                <th className="py-3 pr-4">Category</th>
                <th className="py-3 pr-4">Base stock</th>
                <th className="py-3 pr-4">Alt display</th>
                <th className="py-3 pr-4">Base rate</th>
                <th className="py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const altUnit =
                  product.dimension === "weight" ? "kg" : product.dimension === "volume" ? "L" : "unit";
                return (
                  <tr className="border-b border-[#eee6da]" key={product.id}>
                    <td className="py-4 pr-4">
                      <strong className="block">{product.name}</strong>
                      <span className="text-xs text-[#66706b]">{product.sku}</span>
                    </td>
                    <td className="py-4 pr-4">{product.category}</td>
                    <td className="py-4 pr-4">{formatQty(product.stockBaseQty, product.baseUnit)}</td>
                    <td className="py-4 pr-4">
                      {formatQty(fromBaseQuantity(product.stockBaseQty, altUnit, product.dimension), altUnit)}
                    </td>
                    <td className="py-4 pr-4">
                      {formatInr(product.pricePerBaseUnitPaise)} / {product.baseUnit}
                    </td>
                    <td className="py-4">
                      <button
                        className="rounded-md border border-[#c9c0b4] px-3 py-2 text-sm font-semibold hover:border-[#9b2f24] hover:text-[#9b2f24]"
                        onClick={() => onDeleteProduct(product.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-[#d7cec0] bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Create product</h2>
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={onCreateProduct}>
          <input className="input" name="name" placeholder="Product name" required />
          <input className="input" name="sku" placeholder="SKU" required />
          <input className="input" name="category" placeholder="Category" required />
          <select className="input" name="dimension" required>
            <option value="weight">Weight: base g</option>
            <option value="volume">Volume: base mL</option>
            <option value="count">Count: base unit</option>
          </select>
          <input
            className="input"
            min="0"
            name="stockBaseQty"
            placeholder="Stock in base units"
            step="0.0001"
            type="number"
            required
          />
          <input
            className="input"
            min="0"
            name="priceRupees"
            placeholder="Price per base unit in INR"
            step="0.0001"
            type="number"
            required
          />
          <textarea
            className="input min-h-24 md:col-span-2"
            name="description"
            placeholder="Description"
            required
          />
          <button
            className="h-11 rounded-md bg-[#19403c] px-4 font-semibold text-white hover:bg-[#23554f]"
            type="submit"
          >
            Save product
          </button>
        </form>
      </section>

      <section className="rounded-md border border-[#d7cec0] bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Incoming quotations/orders</h2>
        <div className="mt-5 space-y-4">
          {orders.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#c9c0b4] p-4 text-sm leading-6 text-[#66706b]">
              No quotations have been placed yet.
            </p>
          ) : (
            orders.map((order) => (
              <article className="rounded-md border border-[#eee6da] p-4" key={order.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#9b5f22]">
                      {order.id.slice(0, 8)} · {order.createdAt}
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">{order.customer}</h3>
                  </div>
                  <select
                    className="h-10 rounded-md border border-[#c9c0b4] bg-white px-3 text-sm font-semibold capitalize"
                    onChange={(event) =>
                      onUpdateOrderStatus(order.id, event.target.value as OrderStatus)
                    }
                    value={order.status}
                  >
                    <option value="new">new</option>
                    <option value="reviewing">reviewing</option>
                    <option value="approved">approved</option>
                    <option value="rejected">rejected</option>
                  </select>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#eee6da] text-xs uppercase tracking-[0.12em] text-[#66706b]">
                        <th className="py-2 pr-4">Product</th>
                        <th className="py-2 pr-4">Ordered</th>
                        <th className="py-2 pr-4">Stored base qty</th>
                        <th className="py-2 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map((line) => (
                        <tr className="border-b border-[#f4eee5]" key={`${order.id}-${line.productId}`}>
                          <td className="py-3 pr-4">
                            <strong className="block">{line.productName}</strong>
                            <span className="text-xs text-[#66706b]">{line.sku}</span>
                          </td>
                          <td className="py-3 pr-4">{formatQty(line.quantity, line.unit)}</td>
                          <td className="py-3 pr-4">{line.baseQuantity.toLocaleString("en-IN")}</td>
                          <td className="py-3 text-right font-semibold">{formatInr(line.lineTotalPaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex justify-end text-lg font-semibold">
                  Total: {formatInr(order.totalPaise)}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyInventory({ onSeedDemo }: { onSeedDemo: () => void }) {
  return (
    <section className="rounded-md border border-[#d7cec0] bg-white p-5 shadow-sm">
      <h2 className="text-2xl font-semibold">No products in Neon yet</h2>
      <p className="mt-2 text-sm leading-6 text-[#66706b]">
        Create products manually from the admin panel or load the demo inventory used for conversion
        testing.
      </p>
      <button
        className="mt-4 h-11 rounded-md bg-[#19403c] px-4 font-semibold text-white hover:bg-[#23554f]"
        onClick={onSeedDemo}
        type="button"
      >
        Load demo inventory
      </button>
    </section>
  );
}
