import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductDetailView } from "@/components/views/product-detail";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Продукт" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ProductDetailView />
    </Suspense>
  );
}
