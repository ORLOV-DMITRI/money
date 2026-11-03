"use client";

import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Badge, EmptyState, IconBubble, Skeleton } from "@/components/ui/misc";
import { useProductStats } from "@/hooks/use-product-stats";
import { useCategories, useLookups } from "@/hooks/use-data";
import { db } from "@/lib/db/db";
import { normalizeKey, UNITS, type Product, type Unit } from "@/lib/db/schema";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/money";
import { useTxEditor } from "@/components/transactions/tx-editor";
import { PriceChange } from "./products";

export function ProductDetailView() {
  const id = useSearchParams().get("id") ?? "";
  const list = useProductStats();
  const lookups = useLookups();
  const openEditor = useTxEditor();
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const router = useRouter();

  if (!list) return <Skeleton className="h-96" />;
  const row = list.find((r) => r.product.id === id);
  if (!row)
    return (
      <Card>
        <EmptyState icon="🤷" title="Продукт не найден" action={<Button asChild><Link href="/products/">К продуктам</Link></Button>} />
      </Card>
    );
  const { product, stats, items } = row;
  const cat = lookups.categories.get(product.categoryId);
  const cheapest = stats.byStore[0];
  const purchases = [...items].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/products/">
            <ArrowLeft /> Продукты
          </Link>
        </Button>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          {items.length === 0 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Удалить"
              onClick={async () => {
                if (!(await confirm({ title: `Удалить «${product.name}»?`, confirmText: "Удалить", destructive: true }))) return;
                await db.products.delete(product.id);
                router.push("/products/");
              }}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <IconBubble icon={cat?.icon ?? "📦"} color={cat?.color} size="lg" />
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-sm text-muted-foreground">
            {cat?.name} · цена за {product.unit}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Последняя цена" value={formatMoney(stats.last?.price ?? 0)} extra={<PriceChange pct={stats.changeSinceFirst} />} />
        <Tile label="Средняя" value={formatMoney(stats.avg)} />
        <Tile label="Мин / макс" value={`${formatMoney(stats.min, { plain: true })} – ${formatMoney(stats.max)}`} />
        <Tile label="Всего потрачено" value={formatMoney(stats.totalSpent)} extra={<span className="text-xs text-muted-foreground">{stats.count} покупок</span>} />
      </div>

      {(stats.changeSixMonths != null || stats.changeSinceFirst != null) && (
        <Card className="mt-4 p-4">
          <p className="text-sm font-semibold">Личная инфляция</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {stats.changeSinceFirst != null && stats.first && (
              <Badge tone={stats.changeSinceFirst > 0 ? "bad" : "good"}>
                С {formatDate(stats.first.date, "d MMM yyyy")}: {formatPercent(stats.changeSinceFirst, { sign: true })}
              </Badge>
            )}
            {stats.changeSixMonths != null && <Badge tone={stats.changeSixMonths > 0 ? "bad" : "good"}>За полгода: {formatPercent(stats.changeSixMonths, { sign: true })}</Badge>}
          </div>
        </Card>
      )}

      {stats.history.length > 1 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>История цены</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="График цены">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(d: string) => formatDate(d, "d MMM")} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => formatMoneyCompact(v)} domain={["auto", "auto"]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as (typeof stats.history)[number];
                      return (
                        <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-lg">
                          <p className="text-muted-foreground">
                            {formatDate(p.date, "d MMMM yyyy")}
                            {p.storeId != null && ` · ${lookups.stores.get(p.storeId)?.name}`}
                          </p>
                          <p className="font-semibold tabular-nums">
                            {formatMoney(p.price)} / {product.unit}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="price" stroke="var(--chart-expense)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {stats.byStore.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Где дешевле</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Магазин</th>
                  <th className="pb-2 text-right font-medium">Средняя</th>
                  <th className="hidden pb-2 text-right font-medium sm:table-cell">Мин.</th>
                  <th className="pb-2 text-right font-medium">Последняя</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {stats.byStore.map((s) => (
                  <tr key={String(s.storeId)} className="border-t">
                    <td className="py-2">
                      {s.storeId != null ? lookups.stores.get(s.storeId)?.name : "Без магазина"}
                      {s === cheapest && stats.byStore.length > 1 && (
                        <Badge tone="good" className="ml-2">
                          дешевле всего
                        </Badge>
                      )}
                      <span className="block text-xs text-muted-foreground">{s.count} покуп.</span>
                    </td>
                    <td className="py-2 text-right font-semibold">{formatMoney(s.avg)}</td>
                    <td className="hidden py-2 text-right sm:table-cell">{formatMoney(s.min)}</td>
                    <td className="py-2 text-right">{formatMoney(s.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cheapest && stats.byStore.length > 1 && (
              <p className="mt-3 text-xs text-muted-foreground">
                В среднем в «{lookups.stores.get(cheapest.storeId!)?.name}» на {formatPercent(((stats.byStore[stats.byStore.length - 1].avg - cheapest.avg) / stats.byStore[stats.byStore.length - 1].avg) * 100)} дешевле, чем в самом дорогом магазине
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Покупки</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-3">
          <ul>
            {purchases.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => openEditor({ txId: it.transactionId })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm hover:bg-muted">
                  <span className="w-28 shrink-0 whitespace-nowrap text-muted-foreground">{formatDate(it.date, "d MMM yyyy")}</span>
                  <span className="min-w-0 flex-1 truncate">{it.storeId != null ? lookups.stores.get(it.storeId)?.name : ""}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {String(it.quantity).replace(".", ",")} {it.unit} × {formatMoney(it.unitPrice, { plain: true })}
                  </span>
                  <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(it.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && <ProductDialog product={product} onDone={() => setEditing(false)} />}
      </Dialog>
    </>
  );
}

function Tile({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
      {extra && <div className="mt-1">{extra}</div>}
    </Card>
  );
}

function ProductDialog({ product, onDone }: { product: Product; onDone: () => void }) {
  const categories = useCategories() ?? [];
  const [name, setName] = useState(product.name);
  const [unit, setUnit] = useState<Unit>(product.unit);
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = normalizeKey(name);
    if (!key) return;
    const clash = await db.products.where("key").equals(key).first();
    if (clash && clash.id !== product.id) return toast.error("Продукт с таким названием уже есть");
    await db.products.update(product.id, { name: name.trim(), key, unit, categoryId });
    toast.success("Сохранено");
    onDone();
  };
  return (
    <DialogContent title="Продукт" size="sm">
      <form onSubmit={save} className="grid gap-4">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Единица">
            <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Категория">
            <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories
                .filter((c) => c.kind === "expense")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        </div>
        <Button type="submit">Сохранить</Button>
      </form>
    </DialogContent>
  );
}
