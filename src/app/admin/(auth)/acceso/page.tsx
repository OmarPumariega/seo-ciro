"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import Logo from "@/components/admin/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Email o contraseña incorrectos");
    } else {
      router.push("/admin");
    }
  }

  const highlights = [
    "Auditoría técnica, rank tracking y SEO local en un solo panel",
    "Datos reales de Search Console, Analytics y DataForSEO",
    "Copilot con IA y generación de títulos, metas, schema y contenido",
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Panel de marca (oculto en móvil) */}
      <aside className="hidden lg:flex flex-col justify-between bg-brand text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" aria-hidden="true">
          <div className="absolute -top-16 -right-16 h-72 w-72 rounded-full bg-white/30 blur-3xl" />
          <div className="absolute bottom-0 -left-10 h-64 w-64 rounded-full bg-black/20 blur-3xl" />
        </div>

        <div className="relative">
          <Logo tone="light" className="text-white" textClassName="text-white text-lg" />
        </div>

        <div className="relative space-y-6">
          <h1 className="text-3xl font-semibold leading-tight">
            El panel SEO interno<br />de Agencia Ciro
          </h1>
          <p className="text-white/80 max-w-md">
            Centraliza todo el trabajo SEO de tus clientes con datos reales, sin saltar
            entre Ahrefs, Semrush ni hojas de cálculo.
          </p>
          <ul className="space-y-2.5">
            {highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm text-white/90">
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} Agencia Ciro</p>
      </aside>

      {/* Formulario */}
      <div className="flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm">
          {/* Logo visible en móvil (en escritorio ya está en el panel izquierdo) */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Logo />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Iniciar sesión</h2>
              <p className="text-sm text-gray-500 mt-1">Accede al panel interno</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  placeholder="tu@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Entrar
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
