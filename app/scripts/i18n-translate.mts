// Writes src/i18n/<lang>.ts by machine-translating the English interface catalogue with gpt-6-luna.
// Usage: npm run i18n:translate [-- si ta]   Existing entries are kept, so reviewed wording isn't overwritten;
// delete a line to have it translated again.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { en } from "../src/i18n/en";
import { catalogEntry } from "../src/lib/languages";
import { machineTranslate } from "../src/lib/translate";

const langs = process.argv.slice(2).length ? process.argv.slice(2) : ["si", "ta"];
for (const lang of langs) {
  const file = path.resolve(`src/i18n/${lang}.ts`);
  const existing: Record<string, string> = fs.existsSync(file) ? (await import(file))[lang] ?? {} : {};
  const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => !existing[k]);
  const out: Record<string, string> = { ...existing };
  for (let i = 0; i < keys.length; i += 40) {
    const batch = keys.slice(i, i + 40);
    const result = await machineTranslate(lang, batch.map((k) => en[k]), "interface");
    if (!result) throw new Error(`Translation failed for ${lang} at ${i}`);
    batch.forEach((k, j) => (out[k] = result[j]));
    process.stdout.write(`${lang}: ${Math.min(i + 40, keys.length)}/${keys.length}\r`);
  }
  const ordered = Object.keys(en).filter((k) => out[k]).map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(out[k])},`);
  const name = catalogEntry(lang)?.name ?? lang;
  fs.writeFileSync(
    file,
    `// ${name} interface text, machine-translated from en.ts with gpt-6-luna. Needs review by a native speaker;\n` +
      `// edit entries freely: \`npm run i18n:translate\` keeps existing lines and only fills in missing keys.\nimport type { Messages } from "./en";\n\n` +
      `export const ${lang}: Partial<Messages> = {\n${ordered.join("\n")}\n};\n`,
  );
  console.log(`\n${lang}: wrote ${ordered.length} entries (${keys.length} new)`);
}
process.exit(0);
