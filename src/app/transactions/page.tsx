import type { Metadata } from "next";
import { Suspense } from "react";
import { TransactionsView } from "@/components/views/transactions";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Операции" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TransactionsView />
    </Suspense>
  );
}
