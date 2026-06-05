import { listAccounts } from "./supabase.mjs";

const rows = await listAccounts(50);
console.table(
  rows.map((r) => ({
    id: r.id,
    cliente: r.client_name,
    clinica: r.clinic_name,
    email: r.temp_email,
    username: r.cal_username,
    event_type_id: r.event_type_id,
    status: r.status,
    criado: r.created_at,
  }))
);
