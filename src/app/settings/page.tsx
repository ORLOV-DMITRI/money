import type { Metadata } from "next";
import { SettingsView } from "@/components/views/settings";

export const metadata: Metadata = { title: "Настройки" };

export default function Page() {
  return <SettingsView />;
}
