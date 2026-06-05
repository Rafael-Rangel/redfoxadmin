import pg from "pg";
import { loadEnv } from "../src/env.mjs";

loadEnv();
const ref = "nkojlmqfewvgrkchpjsw";
const password = process.env.SUPABASE_SECRET_KEY;
const regions = [
  "sa-east-1", "us-east-1", "us-west-1", "eu-west-1", "eu-central-1",
  "ap-southeast-1", "ap-northeast-1", "ca-central-1",
];

for (const region of regions) {
  for (const prefix of ["aws-0", "aws-1"]) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const client = new pg.Client({
      host,
      port: 6543,
      database: "postgres",
      user: `postgres.${ref}`,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      const r = await client.query("select 1 as ok");
      console.log("CONNECTED", host, r.rows);
      await client.end();
      process.exit(0);
    } catch (e) {
      console.log(host, e.message.split("\n")[0]);
      await client.end().catch(() => {});
    }
  }
}
