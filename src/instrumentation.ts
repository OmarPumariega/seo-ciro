// Único fichero que Next.js auto-descubre para el hook de instrumentación
// (App Router, convención de archivo — ver docs oficiales). Delega la lógica
// real a instrumentation-node.ts, y solo en el runtime de Node — ahí es
// donde existen los módulos nativos que necesitan Prisma/pg; si se ejecutara
// también en el runtime edge rompería peticiones.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { register: registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
