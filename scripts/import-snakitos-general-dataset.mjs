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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

function buildRuntimeKnowledge(records) {
  const grouped = new Map();

  for (const record of records) {
    const key = `${record.intent}::${record.language}`;
    const existing =
      grouped.get(key) ??
      {
        intent: record.intent || "general",
        language: record.language || "english",
        examples: [],
        answers: [],
        tags: new Map(),
        qualityRules: new Map(),
        source: record.source || "Snakitos chatbot master training guide",
        total: 0,
        escalations: 0,
      };

    existing.total += 1;
    if (record.requires_escalation) {
      existing.escalations += 1;
    }

    if (
      record.user_message &&
      !existing.examples.includes(record.user_message) &&
      existing.examples.length < 12
    ) {
      existing.examples.push(record.user_message);
    }

    if (
      record.ideal_answer &&
      !existing.answers.includes(record.ideal_answer) &&
      existing.answers.length < 6
    ) {
      existing.answers.push(record.ideal_answer);
    }

    for (const tag of record.tags) {
      existing.tags.set(tag, (existing.tags.get(tag) || 0) + 1);
    }

    if (record.quality_rule) {
      existing.qualityRules.set(
        record.quality_rule,
        (existing.qualityRules.get(record.quality_rule) || 0) + 1,
      );
    }

    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .sort((left, right) => right.total - left.total)
    .map((group, index) => {
      const tags = Array.from(group.tags.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 12)
        .map(([tag]) => tag);
      const qualityRules = Array.from(group.qualityRules.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([rule]) => rule);
      const escalationRate = group.total > 0 ? Math.round((group.escalations / group.total) * 100) : 0;

      return {
        id: `general-200k-runtime-${String(index + 1).padStart(4, "0")}`,
        intent: group.intent,
        language: group.language,
        name: `General Dataset: ${group.intent} (${group.language})`,
        category: `dataset_${slugify(group.intent) || "general"}`,
        source: "snakitos_general_200k_runtime",
        link: "https://snakitos.com",
        total_examples: group.total,
        escalation_rate: escalationRate,
        tags,
        quality_rules: qualityRules,
        examples: group.examples,
        approved_answers: group.answers,
        text: [
          `Intent: ${group.intent}.`,
          `Language: ${group.language}.`,
          `Total examples: ${group.total}.`,
          `Escalation rate: ${escalationRate}%.`,
          tags.length > 0 ? `Tags: ${tags.join(", ")}.` : "",
          qualityRules.length > 0 ? `Quality rules: ${qualityRules.join(", ")}.` : "",
          group.examples.length > 0
            ? `Customer examples: ${group.examples.map((item) => `"${item}"`).join(" | ")}.`
            : "",
          group.answers.length > 0
            ? `Approved answer patterns: ${group.answers.map((item) => `"${item}"`).join(" | ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    });
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

  const runtimeKnowledge = buildRuntimeKnowledge(manifestRecords);
  await fs.writeFile(
    path.join(packDir, "18-general-200k-runtime.json"),
    `${JSON.stringify(runtimeKnowledge, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Imported Snakitos general dataset sample (${sampleRecords.length} rows) into ${packDir}`,
  );
  console.log(
    `Generated manifest using ${manifestRecords.length} row(s)${sampleOnly ? " from sample only" : ""}.`,
  );
  console.log(`Generated ${runtimeKnowledge.length} runtime knowledge item(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
