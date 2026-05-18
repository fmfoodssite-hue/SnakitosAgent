import fs from "node:fs";
import path from "node:path";
import capabilityKnowledge from "../apps/chatbot/src/server/data/capability-knowledge.json" with { type: "json" };

const repoRoot = path.resolve(import.meta.dirname, "..");
const aiServicePath = path.join(
  repoRoot,
  "apps",
  "chatbot",
  "src",
  "server",
  "services",
  "ai.service.ts",
);
const ragPromptPath = path.join(
  repoRoot,
  "apps",
  "chatbot",
  "src",
  "server",
  "data",
  "snakitos-rag-pack",
  "10-final-chatbot-system-prompt.txt",
);
const guidePath = path.join(
  repoRoot,
  "apps",
  "chatbot",
  "src",
  "server",
  "data",
  "snakitos-rag-pack",
  "16-complete-training-guide.md",
);
const readmePath = path.join(
  repoRoot,
  "apps",
  "chatbot",
  "src",
  "server",
  "data",
  "snakitos-rag-pack",
  "README.md",
);

const aiServiceSource = fs.readFileSync(aiServicePath, "utf8");
const ragPromptSource = fs.readFileSync(ragPromptPath, "utf8");
const guideSource = fs.readFileSync(guidePath, "utf8");
const readmeSource = fs.readFileSync(readmePath, "utf8");

const failures = [];

function expectIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    failures.push({ label, expectedToInclude: needle });
  }
}

function expectNotIncludes(haystack, needle, label) {
  if (haystack.includes(needle)) {
    failures.push({ label, unexpectedMatch: needle });
  }
}

function expectCapability(id, needle, label) {
  const record = capabilityKnowledge.find((entry) => entry.id === id);
  if (!record || !String(record.description).includes(needle)) {
    failures.push({ label, id, expectedToInclude: needle });
  }
}

expectIncludes(aiServiceSource, "Increase conversion rate and average order value", "live prompt has conversion goal");
expectIncludes(aiServiceSource, "Promote better-value bundles when relevant", "live prompt has bundle goal");
expectIncludes(aiServiceSource, "Move the customer one step closer to purchase", "live prompt has conversion flow");
expectIncludes(aiServiceSource, "Do NOT guess missing information.", "live prompt anti-hallucination");
expectIncludes(aiServiceSource, "If free shipping or discount details are not confirmed in backend context, do not mention them.", "live prompt guards free shipping");
expectIncludes(aiServiceSource, "certificate copies", "live prompt escalation covers certificates");
expectIncludes(aiServiceSource, "Roman Urdu", "live prompt mentions Roman Urdu");
expectNotIncludes(aiServiceSource, "Iâ€™m sorry", "live prompt encoding is clean");

expectIncludes(ragPromptSource, "Primary mission:", "rag prompt has mission section");
expectIncludes(ragPromptSource, "Promote better-value bundles when relevant", "rag prompt bundle guidance");
expectIncludes(ragPromptSource, "Escalate to support for:", "rag prompt escalation list");

expectIncludes(guideSource, "Snakitos AI Chatbot Complete Training Guide", "guide file exists");
expectIncludes(guideSource, "Increase average order value", "guide covers aov");
expectIncludes(guideSource, "Repeat Purchase Suggestions", "guide covers repeat purchase");

expectIncludes(readmeSource, "16 complete training guide", "rag readme lists guide");

expectCapability("cap-sales-cart-recovery", "value-led bundle positioning", "capability sales guidance updated");
expectCapability("cap-upselling-cross-selling", "sweet-with-spicy balancing picks", "capability cross-sell guidance updated");
expectCapability("cap-human-handoff", "exact allergen confirmation", "capability escalation expanded");
expectCapability("cap-repeat-purchase", "welcome returning customers", "repeat purchase capability added");

const totalAssertions = 18;
console.log(`Ran ${totalAssertions} training guide alignment checks.`);
console.log(`Passed: ${totalAssertions - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
