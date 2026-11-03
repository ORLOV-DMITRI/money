import type { Metadata } from "next";
import { BudgetsView } from "@/components/views/budgets";

export const metadata: Metadata = { title: "Бюджеты" };

export default function Page() {
  return <BudgetsView />;
}
