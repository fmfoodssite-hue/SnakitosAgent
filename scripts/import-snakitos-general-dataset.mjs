import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const root = process.cwd();
const packDir = path.join(root, "apps", "chatbot", "src", "server", "data", "snakitos-rag-pack");
const defaultZipPath = "c:\\Users\\asifm\\Downloads\\snakitos_general_200k_dataset.zip";

function usage() {
  console.log(
    "Usage: node scripts/import-snakitos-general-dataset.mjs [zip-path] [--sample-only]",
  );
}

function parseArgs(argv) {
  const args = [...argv];
  const sampleOnly = args.includes("--sample-only");
  const filtered = args.filter((arg) => arg !== "--sample-only");
  const zipPath = filtered[0] || defaultZipPath;
  return { zipPath, sampleOnly };
}

async function extractFileFromZip(zipPath, entryName) {
  const { stdout } = await execFileAsync("tar", ["-xOf", zipPath, entryName], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  return stdout;
}

function parseJsonl(jsonl) {
  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizeDatasetRow(row) {
  return {
    id: String(row.id || ""),
    split: String(row.split || ""),
    language: String(row.language || ""),
    intent: String(row.intent || ""),
    user_message: String(row.user_message || ""),
    ideal_answer: String(row.ideal_answer || ""),
    requires_escalation: Boolean(row.requires_escalation),
    tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
    source: String(row.source || ""),
    quality_rule: String(row.quality_rule || ""),
  };
}

function buildManifest(records, readmeText) {
  const intents = new Map();
  const languages = new Map();

  for (const record of records) {
    intents.set(record.intent, (intents.get(record.intent) || 0) + 1);
    languages.set(record.language, (languages.get(record.language) || 0) + 1);
  }

  return {
    name: "Snakitos General 200k Dataset",
    imported_at: new Date().toISOString(),
    total_records: records.length,
    intent_count: intents.size,
    intents: Array.from(intents.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 25)
      .map(([intent, count]) => ({ intent, count })),
    languages: Array.from(languages.entries()).map(([language, count]) => ({ language, count })),
    notes: readmeText.trim(),
  };
}

async function main() {
  const { zipPath, sampleOnly } = parseArgs(process.argv.slice(2));
  if (process.argv.includes("--help")) {
    usage();
    return;
  }

  const sampleJsonl = await extractFileFromZip(zipPath, "snakitos_general_sample_500.jsonl");
  const readmeText = await extractFileFromZip(zipPath, "README_snakitos_dataset.txt");
  const sampleRecords = parseJsonl(sampleJsonl).map(normalizeDatasetRow);

  await fs.mkdir(packDir, { recursive: true });
  await fs.writeFile(
    path.join(packDir, "18-general-200k-sample.json"),
    `${JSON.stringify(sampleRecords, null, 2)}\n`,
    "utf8",
  );

  await fs.writeFile(
    path.join(packDir, "18-general-200k-readme.txt"),
    readmeText,
    "utf8",
  );

  const manifestRecords = sampleOnly
    ? sampleRecords
    : parseJsonl(
        await extractFileFromZip(zipPath, "snakitos_general_200k_train.jsonl"),
      ).map(normalizeDatasetRow);

  await fs.writeFile(
    path.join(packDir, "18-general-200k-manifest.json"),
    `${JSON.stringify(buildManifest(manifestRecords, readmeText), null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Imported Snakitos general dataset sample (${sampleRecords.length} rows) into ${packDir}`,
  );
  console.log(
    `Generated manifest using ${manifestRecords.length} row(s)${sampleOnly ? " from sample only" : ""}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
