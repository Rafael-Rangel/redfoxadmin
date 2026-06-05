import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import {
  createCalcomAccount,
  verifyEmailAndFinishOnboarding,
  generatePassword,
  generateUsername,
} from "./calcom.mjs";
import { configureAccountAfterLogin } from "./calcom-setup.mjs";
import { createTempEmail, waitForVerificationLink } from "./tempmail.mjs";
import { createAccountRecord, updateAccountRecord } from "./supabase.mjs";
import { normalizeConfig, validateConfig, buildSummary } from "./intake-schema.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--")) {
      args[key.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function loadConfigFromFile(configPath) {
  const full = resolve(configPath);
  if (!existsSync(full)) throw new Error(`Arquivo não encontrado: ${full}`);
  const data = JSON.parse(readFileSync(full, "utf8"));
  const raw = data.config || data;
  const normalized = normalizeConfig({
    ...raw,
    _sourceText: data.intake_raw || data._sourceText || "",
  });
  const validation = validateConfig(normalized);
  if (!validation.valid) {
    throw new Error(`Config inválida: faltam ${validation.missing_fields.join(", ")}`);
  }
  return {
    config: normalized,
    intake_raw: data.intake_raw || null,
    intake_parsed: data.intake_parsed || data,
    extras: normalized.extras || data.extras || {},
  };
}

function resolveParams(args) {
  if (args.config) {
    const loaded = loadConfigFromFile(args.config);
    const c = loaded.config;
    return {
      clientName: c.doctor_name,
      clinicName: c.clinic_name,
      timezone: c.timezone,
      durationMin: c.duration_min,
      eventTitle: c.event_title,
      locationAddress: c.location_address,
      availability: c.availability,
      profileReference: args.reference || null,
      intakeMeta: {
        intake_raw: loaded.intake_raw,
        intake_parsed: loaded.intake_parsed,
        extras: loaded.extras,
      },
    };
  }

  return {
    clientName: args.name,
    clinicName: args.clinic || "",
    timezone: args.timezone || "America/Sao_Paulo",
    durationMin: Number(args.duration) || 40,
    eventTitle: "Consulta",
    locationAddress: "",
    availability: {
      slots: [
        { start: "07:45", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
      saturday_enabled: false,
    },
    profileReference: args.reference || null,
    intakeMeta: null,
  };
}

async function ensureTableExists() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/calcom_accounts?select=id&limit=1`, {
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
    },
  });
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  if (body?.code === "42P01") {
    throw new Error(
      "Tabela calcom_accounts não existe. Rode migration.sql no SQL Editor do Supabase ou execute: npm run setup"
    );
  }
  throw new Error(body?.message || "Falha ao acessar calcom_accounts");
}

export async function createAccountFromParams(params) {
  const {
    clientName,
    clinicName,
    timezone,
    durationMin,
    eventTitle,
    locationAddress,
    availability,
    profileReference,
    intakeMeta,
    headless = process.env.HEADLESS === "true",
  } = params;

  if (!clientName) throw new Error("doctor_name / --name é obrigatório");

  let record = null;
  let browser = null;

  try {
    await ensureTableExists();
    console.log("1/8 Criando tempmail...");
    const tempmail = await createTempEmail();

    record = await createAccountRecord({
      client_name: clientName,
      clinic_name: clinicName || null,
      temp_email: tempmail.address,
      temp_email_password: tempmail.password,
      timezone,
      profile_reference: profileReference,
      status: "email_created",
    });

    const calPassword = generatePassword();
    const calUsername = generateUsername(clientName, clinicName);

    await updateAccountRecord(record.id, {
      cal_password: calPassword,
      cal_username: calUsername,
    });

    console.log(`   Email: ${tempmail.address}`);

    console.log("2/8 Abrindo cadastro no Cal.com (resolva o captcha no Chrome)...");
    const { browser: launchedBrowser, page } = await createCalcomAccount({
      email: tempmail.address,
      password: calPassword,
      fullName: clientName,
      username: calUsername,
      timezone,
      headless,
      onStatus: async (status) => updateAccountRecord(record.id, { status }),
    });
    browser = launchedBrowser;

    console.log("3/8 Aguardando e-mail de verificação (API mail.tm)...");
    const verificationUrl = await waitForVerificationLink(tempmail.token);
    console.log(`   Link recebido: ${verificationUrl.slice(0, 60)}...`);

    console.log("4/8 Verificando e-mail...");
    console.log("5/8 Concluindo onboarding...");
    await verifyEmailAndFinishOnboarding(page, verificationUrl, {
      fullName: clientName,
      username: calUsername,
      timezone,
      onStatus: async (status) => updateAccountRecord(record.id, { status }),
    });

    console.log("6/8 Configurações > Geral...");
    console.log("7/8 Tipos de Evento + Disponibilidade...");
    const setup = await configureAccountAfterLogin(page, {
      durationMin,
      eventTitle,
      timezone,
      locationAddress,
      availability,
    });

    const slug = eventTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const slotSummary = (availability?.slots || []).map((s) => `${s.start}-${s.end}`).join(", ");

    const inDashboard = setup.dashboardUrl?.includes("app.cal.com");
    const finalData = {
      status: inDashboard && setup.eventTypeId ? "completed" : inDashboard ? "onboarding_done" : "failed",
      event_type_id: setup.eventTypeId,
      cal_username: calUsername,
      timezone,
      metadata: {
        booking_url: setup.eventTypeId ? `https://cal.com/${calUsername}/${slug || "consulta"}` : null,
        dashboard_url: setup.dashboardUrl,
        plan: "free",
        setup_completed: true,
        event_title: eventTitle,
        event_duration_min: durationMin,
        availability: `seg-sex ${slotSummary}`,
        language: "pt-BR",
        time_format: "24h",
        location_address: locationAddress || null,
        ...(intakeMeta?.intake_raw ? { intake_raw: intakeMeta.intake_raw } : {}),
        ...(intakeMeta?.intake_parsed ? { intake_parsed: intakeMeta.intake_parsed } : {}),
        ...(intakeMeta?.extras?.ai_name ? { ai_name: intakeMeta.extras.ai_name } : {}),
        ...(intakeMeta?.extras?.phone_ia ? { phone_ia: intakeMeta.extras.phone_ia } : {}),
        ...(intakeMeta?.extras?.gmail ? { gmail: intakeMeta.extras.gmail } : {}),
      },
      error_message:
        inDashboard && setup.eventTypeId
          ? null
          : inDashboard
            ? "Configuração parcial — eventTypeId não capturado"
            : "Não concluiu configuração no painel do Cal.com",
    };

    record = await updateAccountRecord(record.id, finalData);

    console.log("8/8 Salvo em calcom_accounts");
    console.log(JSON.stringify(record, null, 2));

    if (process.env.KEEP_BROWSER_OPEN !== "false") {
      console.log("\nPainel aberto no Chrome por 20s para você ver.");
      if (!page.isClosed()) await page.waitForTimeout(20000).catch(() => {});
    }

    await browser.close();
    browser = null;
    return record;
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    if (record?.id) {
      const current = await updateAccountRecord(record.id, {}).catch(() => null);
      const alreadyCompleted = current?.status === "completed" || !!current?.event_type_id;
      if (!alreadyCompleted) {
        await updateAccountRecord(record.id, {
          status: "failed",
          error_message: error.message,
        }).catch(() => {});
      }
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const params = resolveParams(args);

  if (!params.clientName && !args.config) {
    console.log('Uso: npm run create -- --name "Dr Nome" --clinic "Clínica X" [--duration 40] [--timezone America/Sao_Paulo]');
    console.log('     npm run create -- --config intake.json');
    process.exit(1);
  }

  try {
    await createAccountFromParams(params);
  } catch (error) {
    console.error("Erro:", error.message);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) main();
