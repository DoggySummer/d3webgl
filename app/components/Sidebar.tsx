"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "메인", href: "/" },
  { label: "비교", href: "/wind" },
  { label: "api호출", href: "/humidity" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname() ?? "/";

  return (
    <aside className="fixed left-0 top-0 h-dvh w-56 border-r border-gray-200 bg-white">
      <div className="h-14 px-4 flex items-center border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900">WebGL Charts</div>
      </div>

      <nav className="p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

