import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnv } from "../src/env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

async function tableExists() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/calcom_accounts?select=id&limit=1`, {
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    },
  });

  if (res.ok) return true;
  const body = await res.json();
  return body?.code !== "42P01";
}

async function runSqlViaPg() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) return false;

  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.log("Instale pg para rodar SQL direto: npm install pg");
    return false;
  }

  const projectRef = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "");
  const client = new pg.default.Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  });

  const sql = readFileSync(join(__dirname, "../migration.sql"), "utf8");
  await client.connect();
  await client.query(sql);
  await client.end();
  return true;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Defina SUPABASE_URL e SUPABASE_SECRET_KEY no .env");
  }

  if (await tableExists()) {
    console.log("Tabela calcom_accounts já existe.");
    return;
  }

  const ran = await runSqlViaPg();
  if (ran && (await tableExists())) {
    console.log("Tabela calcom_accounts criada com sucesso.");
    return;
  }

  console.log("\nNão foi possível criar a tabela automaticamente.");
  console.log("Execute o arquivo migration.sql no SQL Editor do Supabase:");
  console.log("Dashboard > SQL Editor > New query > cole migration.sql > Run\n");
  console.log("Ou adicione SUPABASE_DB_PASSWORD no .env e rode: npm run setup");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
