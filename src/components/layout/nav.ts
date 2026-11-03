import {
  ChartPie,
  House,
  type LucideIcon,
  Package,
  PiggyBank,
  ReceiptText,
  Repeat,
  Settings,
  Tags,
  Target,
  Wallet,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Главная", icon: House },
  { href: "/transactions/", label: "Операции", icon: ReceiptText },
  { href: "/goals/", label: "Копилки", icon: PiggyBank },
  { href: "/reports/", label: "Отчёты", icon: ChartPie },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/products/", label: "Продукты и цены", icon: Package },
  { href: "/budgets/", label: "Бюджеты", icon: Target },
  { href: "/recurring/", label: "Регулярные платежи", icon: Repeat },
  { href: "/accounts/", label: "Счета", icon: Wallet },
  { href: "/categories/", label: "Категории", icon: Tags },
  { href: "/settings/", label: "Настройки", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  const p = pathname.replace(/\/+$/, "") || "/";
  const h = href.replace(/\/+$/, "") || "/";
  return h === "/" ? p === "/" : p === h || p.startsWith(h + "/");
}
