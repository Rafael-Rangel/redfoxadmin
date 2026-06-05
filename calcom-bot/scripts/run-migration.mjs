import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
import { loadEnv } from "../src/env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv();

const ref = process.env.SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");
const sql = readFileSync(join(__dirname, "../migration.sql"), "utf8");

const candidates = [
  process.env.SUPABASE_DB_PASSWORD,
  process.env.SUPABASE_SECRET_KEY,
].filter(Boolean);

const hosts = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  { host: `aws-0-sa-east-1.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
  { host: `aws-0-us-east-1.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
];

for (const password of candidates) {
  for (const cfg of hosts) {
    const client = new pg.Client({
      ...cfg,
      database: "postgres",
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      await client.query(sql);
      await client.end();
      console.log(`Migration OK via ${cfg.user}@${cfg.host}`);
      process.exit(0);
    } catch (err) {
      await client.end().catch(() => {});
      console.log(`Falhou ${cfg.host}: ${err.message}`);
    }
  }
}

process.exit(1);
