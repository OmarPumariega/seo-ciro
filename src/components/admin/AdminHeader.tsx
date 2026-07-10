"use client";

import { signOut, useSession } from "next-auth/react";
import { Menu, LogOut } from "lucide-react";

export default function AdminHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-100 bg-white">
      <button className="md:hidden text-gray-500" onClick={onOpenNav}>
        <Menu className="h-5 w-5" />
      </button>
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
