"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as AlertPrimitive from "@radix-ui/react-alert-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlayClass = "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]";
/** На телефоне — шторка снизу, от sm — модалка по центру */
const contentClass =
  "fixed z-50 flex flex-col bg-card shadow-xl outline-none " +
  "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl data-[state=open]:animate-[sheet-in_220ms_cubic-bezier(0.32,0.72,0,1)] " +
  "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-h-[88dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=open]:animate-[pop-in_160ms_ease-out]";

export function DialogContent({
  className,
  children,
  title,
  description,
  size = "md",
  footer,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
}) {
  const sizes = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content className={cn(contentClass, sizes[size], className)} {...props}>
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-3 sm:pt-5">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : ""}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" className="-mr-2 shrink-0" aria-label="Закрыть">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex shrink-0 gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ---------- Подтверждение: const ok = await confirm({...}) ---------- */

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  destructive?: boolean;
}

const ConfirmContext = React.createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = React.useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertPrimitive.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
        <AlertPrimitive.Portal>
          <AlertPrimitive.Overlay className={overlayClass} />
          <AlertPrimitive.Content className={cn(contentClass, "sm:max-w-sm p-5 gap-4")}>
            <div>
              <AlertPrimitive.Title className="text-lg font-semibold">{state?.title}</AlertPrimitive.Title>
              <AlertPrimitive.Description className="mt-1 text-sm text-muted-foreground">{state?.description ?? ""}</AlertPrimitive.Description>
            </div>
            <div className="flex gap-2 pb-[env(safe-area-inset-bottom)]">
              <AlertPrimitive.Cancel asChild>
                <Button variant="secondary" className="flex-1">
                  Отмена
                </Button>
              </AlertPrimitive.Cancel>
              <AlertPrimitive.Action asChild>
                <Button variant={state?.destructive ? "destructive" : "default"} className="flex-1" onClick={() => close(true)}>
                  {state?.confirmText ?? "Да"}
                </Button>
              </AlertPrimitive.Action>
            </div>
          </AlertPrimitive.Content>
        </AlertPrimitive.Portal>
      </AlertPrimitive.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return React.useContext(ConfirmContext);
}
