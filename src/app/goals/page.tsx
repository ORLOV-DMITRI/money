import type { Metadata } from "next";
import { GoalsView } from "@/components/views/goals";

export const metadata: Metadata = { title: "Копилки" };

export default function Page() {
  return <GoalsView />;
}
