"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Badge, IconBubble, Skeleton, Switch } from "@/components/ui/misc";
import { ColorPicker, EmojiPicker } from "@/components/ui/pickers";
import { useAccounts, useBalances } from "@/hooks/use-data";
import { db } from "@/lib/db/db";
import { ACCOUNT_TYPE_LABEL, type Account, type AccountType } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";

export function AccountsView() {
  const accounts = useAccounts();
  const balances = useBalances();
  const [edit, setEdit] = useState<Account | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="Счета"
        description={balances ? `Свободных денег: ${formatMoney(balances.totals.free)}` : undefined}
        actions={
          <Button onClick={() => setEdit("new")}>
            <Plus /> Новый счёт
          </Button>
        }
      />
      {!accounts ? (
        <Skeleton className="h-48" />
      ) : (
        <Card>
          <CardContent className="px-2 sm:px-3">
            <ul>
              {accounts.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setEdit(a)} className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-muted">
                    <IconBubble icon={a.icon} color={a.color} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{a.name}</span>
                        {a.archived && <Badge>в архиве</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[a.type]}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatMoney(balances?.accounts.get(a.id) ?? 0)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="px-2 pt-2 text-xs text-muted-foreground">
              Перевести деньги между счетами: «+» → «Перевод». Операции по счёту —{" "}
              <Link href="/transactions/?period=all" className="text-primary hover:underline">
                в ленте
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}
      <Dialog open={edit != null} onOpenChange={(o) => !o && setEdit(null)}>
        {edit != null && <AccountDialog account={edit === "new" ? undefined : edit} onDone={() => setEdit(null)} />}
      </Dialog>
    </>
  );
}

function AccountDialog({ account, onDone }: { account?: Account; onDone: () => void }) {
  const confirm = useConfirm();
  const accounts = useAccounts() ?? [];
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "card");
  const [icon, setIcon] = useState(account?.icon ?? "💳");
  const [color, setColor] = useState(account?.color ?? "#3b82f6");
  const [initial, setInitial] = useState<number | null>(account?.initialBalance || null);
  const [archived, setArchived] = useState(account?.archived ?? false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Назови счёт");
    const data = { name: name.trim(), type, icon, color, initialBalance: initial ?? 0, archived };
    if (account) await db.accounts.update(account.id, data);
    else await db.accounts.add({ ...data, order: accounts.length, createdAt: Date.now() });
    toast.success("Счёт сохранён");
    onDone();
  };

  const remove = async () => {
    if (!account) return;
    const used = (await db.transactions.where("accountId").equals(account.id).count()) + (await db.transactions.where("toAccountId").equals(account.id).count());
    if (used > 0) {
      toast.error(`По счёту есть операции (${used}). Его можно отправить в архив`);
      return;
    }
    if (!(await confirm({ title: `Удалить «${account.name}»?`, confirmText: "Удалить", destructive: true }))) return;
    await db.accounts.delete(account.id);
    onDone();
  };

  return (
    <DialogContent title={account ? "Счёт" : "Новый счёт"}>
      <form onSubmit={save} className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Название" className="col-span-2 sm:col-span-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kaspi Gold" autoFocus={!account} />
          </Field>
          <Field label="Тип" className="col-span-2 sm:col-span-1">
            <NativeSelect value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Начальный остаток" hint="Сколько было на счёте до начала учёта">
          <AmountInput value={initial} onChange={setInitial} ariaLabel="Начальный остаток" />
        </Field>
        <Field label="Иконка">
          <EmojiPicker value={icon} onChange={setIcon} />
        </Field>
        <Field label="Цвет">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        {account && (
          <label className="flex items-center justify-between gap-3 text-sm">
            В архиве (скрыт из выбора и баланса)
            <Switch checked={archived} onCheckedChange={setArchived} label="В архиве" />
          </label>
        )}
        <Button type="submit">Сохранить</Button>
        {account && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
            <Trash2 /> Удалить
          </Button>
        )}
      </form>
    </DialogContent>
  );
}
