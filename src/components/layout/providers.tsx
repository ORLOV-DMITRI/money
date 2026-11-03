"use client";

import { Toaster } from "sonner";
import { ConfirmProvider } from "@/components/ui/dialog";
import { TxEditorProvider } from "@/components/transactions/tx-editor";
import { ThemeProvider, useTheme } from "./theme";
import { Bootstrap } from "./bootstrap";
import { AppShell } from "./app-shell";

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-center" richColors closeButton duration={4000} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ConfirmProvider>
        <TxEditorProvider>
          <Bootstrap />
          <AppShell>{children}</AppShell>
          <ThemedToaster />
        </TxEditorProvider>
      </ConfirmProvider>
    </ThemeProvider>
  );
}
