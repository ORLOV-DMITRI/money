import type { Metadata } from "next";
import { ReportsView } from "@/components/views/reports";

export const metadata: Metadata = { title: "Отчёты" };

export default function Page() {
  return <ReportsView />;
}
