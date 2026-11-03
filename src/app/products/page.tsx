import type { Metadata } from "next";
import { ProductsView } from "@/components/views/products";

export const metadata: Metadata = { title: "Продукты и цены" };

export default function Page() {
  return <ProductsView />;
}
