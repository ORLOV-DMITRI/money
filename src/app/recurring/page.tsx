import type { Metadata } from "next";
import { RecurringView } from "@/components/views/recurring";

export const metadata: Metadata = { title: "Регулярные платежи" };

export default function Page() {
  return <RecurringView />;
}
