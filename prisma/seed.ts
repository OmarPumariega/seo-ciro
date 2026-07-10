import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@agenciaciro.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password: hashedPassword,
      role: "admin",
    },
  });

  console.log("✓ Seed completado");
  console.log(`  Login: ${email} / ${password}`);
  console.log("  ⚠️  Cambia estas credenciales antes de usar en producción");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
