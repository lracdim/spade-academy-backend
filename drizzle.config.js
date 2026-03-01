import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: "postgresql://postgres:sdNdXWANPCUevEhEkOWJITfcBDXoKxzQ@shinkansen.proxy.rlwy.net:32517/railway",
    },
});