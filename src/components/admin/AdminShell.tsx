"use client";

import { useState } from "react";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import CopilotWidget from "@/components/admin/CopilotWidget";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AdminSidebar navOpen={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AdminHeader onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      {/* Vive aquí (no dentro de <main>) porque AdminShell se monta una sola
          vez para todo /admin — no remonta al navegar entre módulos de un
          proyecto, así que el widget conserva su estado (abierto/minimizado,
          hilo activo) sin Context ni librería de estado nueva. */}
      <CopilotWidget />
    </div>
  );
}
