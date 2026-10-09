import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Development mode: never load .env.production.local or .env.preview.local, so a local `prisma migrate`
// cannot reach a hosted database by accident. Production migrates in the Vercel build, which sets the
// variables itself; to target a hosted database on purpose, pass its URL explicitly.
loadEnvConfig(process.cwd(), true);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { seed: "tsx prisma/seed.ts" },
  datasource: {
    // Migrations need a direct connection; Neon's pooler does not support them reliably.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/emailstats",
  },
});
