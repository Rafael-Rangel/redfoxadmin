const MAIL_TM_BASE = "https://api.mail.tm";

function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function createTempEmail() {
  const domainsRes = await fetch(`${MAIL_TM_BASE}/domains`, {
    headers: { Accept: "application/json" },
  });
  if (!domainsRes.ok) throw new Error("Falha ao buscar domínios do mail.tm");
  const domainsData = await domainsRes.json();
  const domains = Array.isArray(domainsData)
    ? domainsData
    : domainsData["hydra:member"] || [];
  const domain = domains.find((d) => d.isActive !== false)?.domain || domains[0]?.domain;
  if (!domain) throw new Error("Nenhum domínio disponível no mail.tm");

  const local = `redfox${randomString(8)}`;
  const address = `${local}@${domain}`;
  const password = `Rf@${randomString(12)}`;

  const accountRes = await fetch(`${MAIL_TM_BASE}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });

  if (!accountRes.ok) {
    const err = await accountRes.text();
    throw new Error(`Falha ao criar tempmail: ${err}`);
  }

  const tokenRes = await fetch(`${MAIL_TM_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });

  if (!tokenRes.ok) throw new Error("Falha ao autenticar tempmail");
  const tokenData = await tokenRes.json();

  return {
    address,
    password,
    token: tokenData.token,
    id: tokenData.id,
  };
}

export async function waitForVerificationLink(token, timeoutMs = 120000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${MAIL_TM_BASE}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      const messages = Array.isArray(data) ? data : data["hydra:member"] || [];
      for (const msg of messages) {
        const detailRes = await fetch(`${MAIL_TM_BASE}/messages/${msg.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!detailRes.ok) continue;
        const detail = await detailRes.json();
        const content = `${detail.subject || ""}\n${detail.text || ""}\n${detail.html || ""}`;
        const match =
          content.match(/https?:\/\/[^\s"'<>]*cal\.com[^\s"'<>]*verify[^\s"'<>]*/i) ||
          content.match(/https?:\/\/[^\s"'<>]*cal\.com[^\s"'<>]*/i);
        if (match) return match[0].replace(/[)>.,;]+$/, "");
      }
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  throw new Error("Timeout aguardando e-mail de verificação do Cal.com");
}
