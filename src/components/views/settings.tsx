"use client";

import { Download, FileSpreadsheet, Monitor, Moon, Plus, RotateCcw, Sparkles, Sun, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { useTheme, type Theme } from "@/components/layout/theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Segmented } from "@/components/ui/misc";
import { useCategories, useTemplates, useToday } from "@/hooks/use-data";
import { db } from "@/lib/db/db";
import { loadDemoData } from "@/lib/db/demo";
import type { Template } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { downloadFile, exportBackup, exportCSV, importBackup, resetAll } from "@/lib/services/data";
import { SECONDARY_NAV } from "@/components/layout/nav";

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const confirm = useConfirm();
  const today = useToday();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!(await confirm({ title: "Восстановить из копии?", description: "Текущие данные будут полностью заменены данными из файла.", confirmText: "Восстановить", destructive: true }))) return;
      await importBackup(data);
      toast.success("Данные восстановлены");
    } catch (e) {
      toast.error(e instanceof SyntaxError ? "Файл повреждён или это не JSON" : (e as Error).message);
    }
  };

  return (
    <>
      <PageHeader title="Настройки" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Оформление</CardTitle>
          </CardHeader>
          <CardContent>
            <Segmented<Theme>
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun className="size-4" /> Светлая</span> },
                { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon className="size-4" /> Тёмная</span> },
                { value: "system", label: <span className="inline-flex items-center gap-1.5"><Monitor className="size-4" /> Как в системе</span> },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Справочники</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {SECONDARY_NAV.filter((n) => n.href !== "/settings/").map((n) => (
              <Button key={n.href} asChild variant="outline" className="justify-start">
                <Link href={n.href}>
                  <n.icon /> {n.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        <TemplatesCard />

        <Card>
          <CardHeader>
            <CardTitle>Данные</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="mb-1 text-sm text-muted-foreground">Всё хранится только в этом браузере. Делай резервную копию, чтобы перенести данные на другое устройство.</p>
            <Button variant="outline" className="justify-start" onClick={async () => downloadFile(JSON.stringify(await exportBackup()), `money-backup-${today}.json`, "application/json")}>
              <Download /> Скачать резервную копию (JSON)
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => fileRef.current?.click()}>
              <Upload /> Восстановить из копии
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" className="justify-start" onClick={async () => downloadFile(await exportCSV(), `operations-${today}.csv`, "text/csv;charset=utf-8")}>
              <FileSpreadsheet /> Операции в CSV (для Excel)
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              disabled={busy}
              onClick={async () => {
                if (!(await confirm({ title: "Загрузить демо-данные?", description: "Текущие данные будут заменены примером за 4 месяца.", confirmText: "Загрузить", destructive: true }))) return;
                setBusy(true);
                await loadDemoData(today);
                setBusy(false);
                toast.success("Демо-данные загружены");
              }}
            >
              <Sparkles /> Заполнить демо-данными
            </Button>
            <Button
              variant="ghost"
              className="justify-start text-destructive"
              onClick={async () => {
                if (!(await confirm({ title: "Удалить все данные?", description: "Операции, копилки, бюджеты — всё. Отменить нельзя. Сначала скачай резервную копию, если она нужна.", confirmText: "Удалить всё", destructive: true }))) return;
                await resetAll();
                toast("Данные сброшены");
              }}
            >
              <RotateCcw /> Сбросить все данные
            </Button>
          </CardContent>
        </Card>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Деньги · учёт расходов в тенге · данные не покидают устройство</p>
    </>
  );
}

function TemplatesCard() {
  const templates = useTemplates();
  const categories = useCategories();
  const [edit, setEdit] = useState<Template | "new" | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Шаблоны</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setEdit("new")}>
          <Plus /> Добавить
        </Button>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm text-muted-foreground">Частые операции в один тап — кнопки на главной.</p>
        <div className="flex flex-wrap gap-2">
          {templates?.map((t) => (
            <button key={t.id} type="button" onClick={() => setEdit(t)} className="rounded-full border px-3 py-1.5 text-sm hover:border-primary/50">
              {categories?.find((c) => c.id === t.categoryId)?.icon} {t.name} <span className="text-muted-foreground">{formatMoney(t.amount)}</span>
            </button>
          ))}
          {templates?.length === 0 && <p className="text-sm text-muted-foreground">Шаблонов пока нет</p>}
        </div>
      </CardContent>
      <Dialog open={edit != null} onOpenChange={(o) => !o && setEdit(null)}>
        {edit != null && <TemplateDialog template={edit === "new" ? undefined : edit} onDone={() => setEdit(null)} />}
      </Dialog>
    </Card>
  );
}

function TemplateDialog({ template, onDone }: { template?: Template; onDone: () => void }) {
  const categories = useCategories() ?? [];
  const [name, setName] = useState(template?.name ?? "");
  const [type, setType] = useState<"expense" | "income">(template?.type ?? "expense");
  const [amount, setAmount] = useState<number | null>(template?.amount ?? null);
  const [categoryId, setCategoryId] = useState(template?.categoryId);
  const cats = categories.filter((c) => c.kind === type && !c.archived);
  const cat = categoryId != null && cats.some((c) => c.id === categoryId) ? categoryId : cats[0]?.id;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount || cat == null) return toast.error("Заполни название и сумму");
    const data = { name: name.trim(), type, amount, categoryId: cat, note: name.trim() };
    if (template) await db.templates.update(template.id, data);
    else await db.templates.add(data);
    onDone();
  };

  return (
    <DialogContent title={template ? "Шаблон" : "Новый шаблон"} size="sm">
      <form onSubmit={save} className="grid gap-4">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: "expense", label: "Расход" },
            { value: "income", label: "Приход" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Обед" />
          </Field>
          <Field label="Сумма">
            <AmountInput value={amount} onChange={setAmount} ariaLabel="Сумма" />
          </Field>
        </div>
        <Field label="Категория">
          <NativeSelect value={cat ?? ""} onChange={(e) => setCategoryId(Number(e.target.value))}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit">Сохранить</Button>
        {template && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              await db.templates.delete(template.id);
              onDone();
            }}
          >
            <Trash2 /> Удалить
          </Button>
        )}
      </form>
    </DialogContent>
  );
}
