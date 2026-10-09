import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function seedAdmin() {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!databaseUrl || !email || !name || !password || password.length < 12) {
    throw new Error("Set DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD (12+ characters) before seeding.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 1 }) });

  try {
    await prisma.user.upsert({
      where: { email },
      create: { email, name, passwordHash: await hash(password, 12), role: "SUPERADMIN", tenantId: null },
      update: { name, passwordHash: await hash(password, 12), role: "SUPERADMIN", tenantId: null },
    });
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin().catch((error: unknown) => {
  console.error("Unable to seed superadmin account.", error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
});
