import { createTempEmail } from "../src/tempmail.mjs";

const mail = await createTempEmail();
console.log("Tempmail OK:", mail.address);
