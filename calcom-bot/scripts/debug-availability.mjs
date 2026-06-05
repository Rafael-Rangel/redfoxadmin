import { chromium } from "playwright";
import { loadEnv } from "../src/env.mjs";
import { listAccounts } from "../src/supabase.mjs";

loadEnv();
const acc = (await listAccounts(5)).find((r) => r.client_name === "Dr Config Teste");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto("https://app.cal.com/auth/login");
await page.waitForTimeout(1500);
const emailBtn = page.getByRole("button", { name: /continue with email/i }).first();
if (await emailBtn.isVisible().catch(() => false)) await emailBtn.click();
const form = page.locator("[data-testid=login-form]");
await form.locator("#email").fill(acc.temp_email);
await form.locator("#password").fill(acc.cal_password);
await form.locator('[type="submit"]').click();
await page.waitForTimeout(5000);

await page.goto("https://app.cal.com/availability");
await page.waitForSelector('[data-testid="schedules"]', { timeout: 30000 });
await page.getByTestId("schedules").first().click();
await page.waitForTimeout(3000);

const testids = await page.locator("[data-testid]").evaluateAll((els) =>
  [...new Set(els.map((el) => el.getAttribute("data-testid")))].filter(Boolean).sort()
);
console.log("testids:", testids.filter((t) => /mon|tue|wed|day|seg|ter|dom|sab|sun|switch|schedule/i.test(t)));

const switches = await page.locator("[role='switch']").evaluateAll((els) =>
  els.map((el) => {
    const parent = el.closest("[data-testid]");
    return { testid: parent?.getAttribute("data-testid"), text: parent?.textContent?.trim().slice(0, 40) };
  })
);
console.log("switches:", switches.slice(0, 10));
console.log(
  "time related:",
  testids.filter((t) => /time|add|copy|interval|availability/i.test(t))
);
const seg = page.getByTestId("segunda-feira");
console.log("segunda html sample:", (await seg.textContent()).slice(0, 120));
const buttons = await seg.locator("button").allTextContents();
console.log("segunda buttons:", buttons);
await seg.getByTestId("add-time-availability").click();
await page.waitForTimeout(1000);
console.log("after add:", (await seg.textContent()).slice(0, 160));
const combos = await seg.locator("[role='combobox'], select, input").evaluateAll((els) =>
  els.map((el) => ({ tag: el.tagName, role: el.getAttribute("role"), text: el.textContent?.trim(), value: el.value }))
);
console.log("segunda inputs:", combos);
await seg.locator('[role="combobox"]').first().click();
await page.waitForTimeout(500);
const opts = await page.locator('[role="option"]').allTextContents();
console.log("time options sample:", opts.filter((t) => t.includes("07") || t.includes("7:")).slice(0, 15));

await browser.close();
