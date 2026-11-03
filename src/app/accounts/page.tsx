import type { Metadata } from "next";
import { AccountsView } from "@/components/views/accounts";

export const metadata: Metadata = { title: "Счета" };

export default function Page() {
  return <AccountsView />;
}
