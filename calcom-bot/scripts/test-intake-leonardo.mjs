import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { loadEnv } from "../src/env.mjs";
import { analyzeIntake, answerFollowUp } from "../src/groq-agent.mjs";

loadEnv();

const QUESTIONNAIRE = `Qual é o nome da clínica/consultório?
D'olhos Hospital Dia - Departamento Dr. Leonardo Beraldo
Endereço(s) onde atua:
AV. MURCHID HOMSI, 2200, QUINTA DAS PAINEIRAS, SÃO JOSÉ DO RIO PRETO/SP
Qual é o Profissional responsável pelos atendimentos na sua clínica ou consultório? (Responda apenas o nome completo)
Dr. Leonardo Beraldo
Qual é o número de atendimento que será aplicado na IA?
+55 (17) 99682-8015
Qual é a duração da primeira avaliação?
A duração da primeira avaliação pode variar conforme a necessidade de cada paciente e os exames realizados.
Qual é o valor médio das suas consultas/avaliação?
R$ 600,00
Quais são os seus horários de atendimento?
DE SEGUNDA À SEXTA-FEIRA. 7:45 ÀS 18:00 HORAS.
Quais são os seus horários de almoço?
12:00-14:00 HORAS.
Você atende aos sábados? Se sim, em quais horários e em qual frequência?
SOMENTE PÓS-OPERATÓRIOS E EMERGÊNCIAS.
Como você quer que a sua IA se chame?
Ana Clara
Seu melhor gmail para compartilharmos o Google Agenda
oftalmologialeonardoberaldo@gmail.com`;

console.log("Analisando questionário Dr. Leonardo Beraldo...\n");
let result = await analyzeIntake(QUESTIONNAIRE);

if (result.status !== "ready") {
  console.log("Follow-up: 40 minutos\n");
  result = await answerFollowUp(QUESTIONNAIRE, result, "A duração padrão da consulta é 40 minutos.");
}

const checks = {
  doctor: /leonardo beraldo/i.test(result.config?.doctor_name || ""),
  clinic: /d'olhos|olhos hospital/i.test(result.config?.clinic_name || ""),
  timezone: result.config?.timezone === "America/Sao_Paulo",
  duration: result.config?.duration_min === 40,
  slots:
    result.config?.availability?.slots?.some((s) => s.start === "07:45") &&
    result.config?.availability?.slots?.some((s) => s.end === "18:00"),
  ready: result.status === "ready",
  saturdayOff: !result.config?.availability?.saturday_enabled,
  address: /murchid homsi/i.test(result.config?.location_address || ""),
  aiName: result.config?.extras?.ai_name?.toLowerCase().includes("ana clara"),
};

console.log(JSON.stringify(result, null, 2));
console.log("\n--- Validação ---");
for (const [k, ok] of Object.entries(checks)) {
  console.log(`${ok ? "OK" : "FALHOU"}: ${k}`);
}

const outDir = join(process.cwd(), ".intake");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "leonardo-test.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      config: result.config,
      intake_raw: QUESTIONNAIRE,
      intake_parsed: result,
      extras: result.config?.extras || {},
    },
    null,
    2
  )
);
console.log(`\nSalvo: ${outPath}`);
console.log(`Status: ${result.status}`);

const allOk = Object.values(checks).every(Boolean);
if (!allOk) process.exit(1);
