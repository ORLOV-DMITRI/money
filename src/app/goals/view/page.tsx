import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalDetailView } from "@/components/views/goal-detail";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Копилка" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <GoalDetailView />
    </Suspense>
  );
}
