import { loadEnv } from "./env.mjs";
import { mergeGroqResult } from "./intake-schema.mjs";

loadEnv();

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `Você é um assistente da REDFOX.IA que extrai dados de questionários de clínicas para configurar o Cal.com.

Retorne APENAS JSON válido (sem markdown) neste formato:
{
  "status": "ready" | "needs_questions",
  "config": {
    "doctor_name": "Dr. Nome Completo",
    "clinic_name": "Nome da clínica",
    "event_title": "Consulta",
    "duration_min": 40,
    "timezone": "America/Sao_Paulo",
    "location_address": "endereço completo",
    "availability": {
      "weekdays": [1,2,3,4,5],
      "slots": [{"start":"07:45","end":"12:00"},{"start":"14:00","end":"18:00"}],
      "saturday_enabled": false
    },
    "extras": {
      "ai_name": "",
      "phone_ia": "",
      "gmail": "",
      "consultation_price": "",
      "insurance": [],
      "specialties": []
    }
  },
  "questions": [],
  "missing_fields": [],
  "summary_pt": "resumo em português"
}

Regras:
- doctor_name: nome do profissional (com Dr. se aplicável)
- clinic_name: nome da clínica/consultório
- duration_min: minutos da consulta; se "variável" ou não informado, use needs_questions e pergunte (sugira 40)
- timezone: IANA (ex: America/Sao_Paulo). Inferir pela cidade/UF do endereço
- Horários seg-sex: se houver almoço 12:00-14:00, divida em 2 slots (manhã e tarde)
- saturday_enabled: false se atende sábado só pós-operatório/emergência
- Não invente dados críticos; se faltar, status=needs_questions
- extras: capture nome da IA, telefone, gmail, convênios etc. do texto`;

function extractJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Resposta da Groq não é JSON válido");
  }
}

export async function callGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY não definida no .env");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API erro ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq retornou resposta vazia");
  return extractJson(content);
}

export async function analyzeIntake(questionnaireText, priorConfig = null) {
  const userContent = priorConfig
    ? `Questionário original:\n${questionnaireText}\n\nConfig parcial já extraída:\n${JSON.stringify(priorConfig, null, 2)}\n\nAtualize o JSON com base no questionário.`
    : `Analise este questionário e extraia os dados para Cal.com:\n\n${questionnaireText}`;

  const raw = await callGroq([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ]);

  return mergeGroqResult(raw, questionnaireText);
}

export async function answerFollowUp(questionnaireText, priorResult, userAnswer) {
  const raw = await callGroq([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Questionário:\n${questionnaireText}\n\nEstado atual:\n${JSON.stringify(priorResult, null, 2)}\n\nResposta do humano às perguntas:\n${userAnswer}\n\nAtualize o JSON. Se tudo estiver completo, status=ready.`,
    },
  ]);

  return mergeGroqResult(raw, questionnaireText);
}
