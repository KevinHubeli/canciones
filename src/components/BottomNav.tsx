"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, Search, UserRound } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const ITEMS = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/canciones", label: "Buscar", icon: Search },
  { href: "/admin", label: "Admin", icon: UserRound },
];

export default function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Viendo una canción dentro de un power: se oculta la barra para que se
  // sienta como una presentación, con toda la pantalla para la letra.
  if (searchParams.get("set")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-1 rounded-full bg-night/70 p-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] backdrop-blur">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                active ? "bg-plum text-mist" : "text-lilac-light"
              }`}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
        <div className="mx-0.5 h-5 w-px bg-plum" aria-hidden />
        <ThemeToggle />
      </div>
    </nav>
  );
}
