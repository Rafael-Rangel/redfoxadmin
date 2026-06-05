import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "../migration.sql"), "utf8");
const projectRef = "nkojlmqfewvgrkchpjsw";

const browser = await chromium.launch({ headless: false, slowMo: 100 });
const page = await browser.newPage();

try {
  await page.goto(`https://supabase.com/dashboard/project/${projectRef}/sql/new`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(5000);

  const editor = page.locator(".monaco-editor textarea, .view-lines, [contenteditable='true']").first();
  await editor.click({ timeout: 15000 }).catch(() => {});
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(sql);
  await page.waitForTimeout(1000);

  const runBtn = page.getByRole("button", { name: /run|executar/i }).first();
  await runBtn.click({ timeout: 15000 });
  await page.waitForTimeout(5000);

  console.log("SQL enviado no editor do Supabase. Verifique se executou com sucesso.");
} catch (error) {
  console.error("Falha na migração via browser:", error.message);
  console.error("Faça login no Supabase e rode migration.sql manualmente.");
  process.exit(1);
} finally {
  await browser.close();
}
