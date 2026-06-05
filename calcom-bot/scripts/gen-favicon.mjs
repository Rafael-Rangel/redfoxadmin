import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");
const b64 = readFileSync(join(publicDir, "logo-redfox.png")).toString("base64");
const svg = [
  "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\">",
  "  <defs><clipPath id=\"c\"><circle cx=\"32\" cy=\"32\" r=\"32\"/></clipPath></defs>",
  "  <circle cx=\"32\" cy=\"32\" r=\"32\" fill=\"#fff\"/>",
  `  <image href="data:image/png;base64,${b64}" width="64" height="64" clip-path="url(#c)" preserveAspectRatio="xMidYMid meet"/>`,
  "</svg>",
].join("\n");
writeFileSync(join(publicDir, "favicon.svg"), svg, "utf8");
console.log("favicon.svg gerado");
