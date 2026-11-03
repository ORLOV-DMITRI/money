import type { Metadata } from "next";
import { CategoriesView } from "@/components/views/categories";

export const metadata: Metadata = { title: "Категории" };

export default function Page() {
  return <CategoriesView />;
}
