import { loadEnv } from "./env.mjs";
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function headers(prefer) {
  const h = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

export async function createAccountRecord(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/calcom_accounts`, {
    method: "POST",
    headers: headers("return=representation"),
    body: JSON.stringify(data),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.message || JSON.stringify(body));
  }
  return body[0];
}

export async function updateAccountRecord(id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/calcom_accounts?id=eq.${id}`, {
    method: "PATCH",
    headers: headers("return=representation"),
    body: JSON.stringify(data),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.message || JSON.stringify(body));
  }
  return body[0];
}

export async function listAccounts(limit = 20) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/calcom_accounts?select=*&order=created_at.desc&limit=${limit}`,
    { headers: headers() }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || JSON.stringify(body));
  return body;
}
