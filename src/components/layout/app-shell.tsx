"use client";

import { Menu, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTxEditor } from "@/components/transactions/tx-editor";
import { cn } from "@/lib/utils";
import { PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from "./nav";
import { SyncIndicator } from "@/components/sync/sync-indicator";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-lg text-primary-foreground">₸</span>
      <span>Деньги</span>
    </Link>
  );
}

function SideLink({ item, pathname, onClick }: { item: NavItem; pathname: string; onClick?: () => void }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <item.icon className="size-[18px]" />
      {item.label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const openEditor = useTxEditor();
  const [menu, setMenu] = useState(false);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Десктоп: боковая панель */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-card/50 p-4 md:flex">
        <Logo />
        <Button onClick={() => openEditor()} className="w-full justify-start">
          <Plus /> Добавить операцию
        </Button>
        <nav className="grid gap-1" aria-label="Основное меню">
          {PRIMARY_NAV.map((i) => (
            <SideLink key={i.href} item={i} pathname={pathname} />
          ))}
        </nav>
        <nav className="grid gap-1" aria-label="Дополнительно">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ещё</p>
          {SECONDARY_NAV.map((i) => (
            <SideLink key={i.href} item={i} pathname={pathname} />
          ))}
        </nav>
        <SyncIndicator withLabel className="mt-auto justify-start" />
      </aside>

      <div className="min-w-0">
        {/* Мобильная шапка */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/85 px-4 backdrop-blur md:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <SyncIndicator />
            <Button variant="ghost" size="icon" aria-label="Меню" onClick={() => setMenu(true)}>
              <Menu />
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 md:pb-10 md:pt-8">{children}</main>
      </div>

      {/* Мобильная нижняя навигация */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-safe backdrop-blur md:hidden" aria-label="Навигация">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {PRIMARY_NAV.slice(0, 2).map((i) => (
            <BottomLink key={i.href} item={i} pathname={pathname} />
          ))}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => openEditor()}
              aria-label="Добавить операцию"
              className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
            >
              <Plus className="size-7" />
            </button>
          </div>
          {PRIMARY_NAV.slice(2).map((i) => (
            <BottomLink key={i.href} item={i} pathname={pathname} />
          ))}
        </div>
      </nav>

      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent title="Меню" size="sm">
          <nav className="grid gap-1">
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((i) => (
              <SideLink key={i.href} item={i} pathname={pathname} onClick={() => setMenu(false)} />
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BottomLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("flex flex-col items-center gap-0.5 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}
    >
      <item.icon className="size-5" />
      {item.label}
    </Link>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
