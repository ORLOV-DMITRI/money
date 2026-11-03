"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge, IconBubble, Segmented, Skeleton, Switch } from "@/components/ui/misc";
import { ColorPicker, EmojiPicker } from "@/components/ui/pickers";
import { useCategories } from "@/hooks/use-data";
import { db } from "@/lib/db/db";
import type { Category, CategoryKind } from "@/lib/db/schema";

export function CategoriesView() {
  const categories = useCategories();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [edit, setEdit] = useState<Category | "new" | null>(null);
  const list = (categories ?? []).filter((c) => c.kind === kind).sort((a, b) => Number(a.archived) - Number(b.archived) || a.order - b.order);

  return (
    <>
      <PageHeader
        title="Категории"
        description="Ключевые слова помогают быстрому вводу: «латте 1500» сам попадёт в кафе"
        actions={
          <Button onClick={() => setEdit("new")}>
            <Plus /> Новая
          </Button>
        }
      />
      <Segmented
        className="mb-4 max-w-xs"
        value={kind}
        onChange={setKind}
        options={[
          { value: "expense", label: "Расходы" },
          { value: "income", label: "Доходы" },
        ]}
      />
      {!categories ? (
        <Skeleton className="h-96" />
      ) : (
        <Card>
          <CardContent className="grid gap-1 px-2 sm:grid-cols-2 sm:px-3">
            {list.map((c) => (
              <button key={c.id} type="button" onClick={() => setEdit(c)} className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-muted">
                <IconBubble icon={c.icon} color={c.color} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{c.name}</span>
                    {c.archived && <Badge>в архиве</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{c.keywords.length ? c.keywords.join(", ") : "без ключевых слов"}</span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
      <Dialog open={edit != null} onOpenChange={(o) => !o && setEdit(null)}>
        {edit != null && <CategoryDialog category={edit === "new" ? undefined : edit} kind={kind} order={categories?.length ?? 0} onDone={() => setEdit(null)} />}
      </Dialog>
    </>
  );
}

function CategoryDialog({ category, kind, order, onDone }: { category?: Category; kind: CategoryKind; order: number; onDone: () => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "📦");
  const [color, setColor] = useState(category?.color ?? "#64748b");
  const [keywords, setKeywords] = useState(category?.keywords.join(", ") ?? "");
  const [archived, setArchived] = useState(category?.archived ?? false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Назови категорию");
    const data = {
      name: name.trim(),
      icon,
      color,
      archived,
      keywords: [...new Set(keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean))],
    };
    if (category) await db.categories.update(category.id, data);
    else await db.categories.add({ ...data, kind, order });
    toast.success("Категория сохранена");
    onDone();
  };

  const remove = async () => {
    if (!category) return;
    const used =
      (await db.transactions.where("categoryId").equals(category.id).count()) +
      (await db.purchaseItems.where("categoryId").equals(category.id).count()) +
      (await db.budgets.where("categoryId").equals(category.id).count());
    if (used > 0) return toast.error("Категория используется. Её можно отправить в архив — история сохранится");
    if (!(await confirm({ title: `Удалить «${category.name}»?`, confirmText: "Удалить", destructive: true }))) return;
    await db.categories.delete(category.id);
    onDone();
  };

  return (
    <DialogContent title={category ? "Категория" : kind === "expense" ? "Новая категория расходов" : "Новая категория доходов"}>
      <form onSubmit={save} className="grid gap-4">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!category} />
        </Field>
        <Field label="Ключевые слова" hint="Через запятую. По ним быстрый ввод узнаёт категорию">
          <Textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="кофе, латте, обед" rows={2} />
        </Field>
        <Field label="Иконка">
          <EmojiPicker value={icon} onChange={setIcon} />
        </Field>
        <Field label="Цвет">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        {category && (
          <label className="flex items-center justify-between gap-3 text-sm">
            В архиве (не предлагать при вводе)
            <Switch checked={archived} onCheckedChange={setArchived} label="В архиве" />
          </label>
        )}
        <Button type="submit">Сохранить</Button>
        {category && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
            <Trash2 /> Удалить
          </Button>
        )}
      </form>
    </DialogContent>
  );
}
