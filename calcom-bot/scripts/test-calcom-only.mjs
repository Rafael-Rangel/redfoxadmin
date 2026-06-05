import {
  createCalcomAccount,
  verifyEmailAndFinishOnboarding,
  generatePassword,
  generateUsername,
} from "../src/calcom.mjs";
import { createTempEmail, waitForVerificationLink } from "../src/tempmail.mjs";

const clientName = process.argv[2] || "Teste Redfox";
const clinicName = process.argv[3] || "Clinica Teste";
const headless = process.env.HEADLESS !== "false";

console.log("Teste parcial (sem Supabase)");
console.log(`Cliente: ${clientName} | Clínica: ${clinicName} | headless: ${headless}`);

const tempmail = await createTempEmail();
const calPassword = generatePassword();
const calUsername = generateUsername(clientName, clinicName);

console.log("Tempmail:", tempmail.address);
console.log("Senha Cal.com:", calPassword);
console.log("Username:", calUsername);

let browser;
try {
  const started = await createCalcomAccount({
    email: tempmail.address,
    password: calPassword,
    fullName: clientName,
    username: calUsername,
    headless,
  });
  browser = started.browser;

  console.log("Aguardando e-mail de verificação...");
  const verificationUrl = await waitForVerificationLink(tempmail.token);
  console.log("Link de verificação recebido");

  const result = await verifyEmailAndFinishOnboarding(started.page, verificationUrl, {
    fullName: clientName,
    username: calUsername,
    timezone: "America/Manaus",
  });

  console.log("Resultado:", JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
}
