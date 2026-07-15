"use client";

import { signOut, useSession } from "next-auth/react";
import { Menu, LogOut } from "lucide-react";
import Logo from "@/components/admin/Logo";

export default function AdminHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-100 bg-white">
      <div className="flex items-center gap-2">
        <button className="md:hidden text-gray-500" onClick={onOpenNav} aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </button>
        {/* Logo en la cabecera solo en móvil (en escritorio ya está en el sidebar) */}
        <div className="md:hidden">
          <Logo />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-gray-500 hidden sm:inline">
          {session?.user?.email}
        </span>
        <button
          onClick={() => signOut({ callbackUrl: "/admin/acceso" })}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          Salir
        </button>
      </div>
    </header>
  );
}
