import { createInterface } from "readline";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { loadEnv } from "../src/env.mjs";
import { analyzeIntake, answerFollowUp } from "../src/groq-agent.mjs";
import { buildSummary } from "../src/intake-schema.mjs";

loadEnv();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

console.log("Cole o questionário (linha vazia + ENTER para finalizar):\n");
let lines = [];
for await (const line of rl) {
  if (line === "" && lines.length > 0) break;
  lines.push(line);
}
const questionnaire = lines.join("\n");

let result = await analyzeIntake(questionnaire);
console.log("\n--- Resumo ---\n", result.summary_pt || buildSummary(result.config));

while (result.status !== "ready") {
  for (const q of result.questions || []) console.log("\n?", q);
  const answer = await ask("\nSua resposta: ");
  result = await answerFollowUp(questionnaire, result, answer);
  console.log("\n--- Resumo ---\n", result.summary_pt || buildSummary(result.config));
}

const outDir = join(process.cwd(), ".intake");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `cli-${Date.now()}.json`);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      config: result.config,
      intake_raw: questionnaire,
      intake_parsed: result,
      extras: result.config?.extras || {},
    },
    null,
    2
  )
);

console.log(`\nSalvo: ${outPath}`);
console.log(`Rode: node src/create-account.mjs --config "${outPath}"`);
rl.close();
