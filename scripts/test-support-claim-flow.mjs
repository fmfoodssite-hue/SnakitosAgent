import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const servicePath = path.join(
  repoRoot,
  "apps",
  "chatbot",
  "src",
  "server",
  "services",
  "support-agent.service.ts",
);

const source = fs.readFileSync(servicePath, "utf8");
const failures = [];

function expectIncludes(needle, label) {
  if (!source.includes(needle)) {
    failures.push({ label, expectedToInclude: needle });
  }
}

function expectNotIncludes(needle, label) {
  if (source.includes(needle)) {
    failures.push({ label, unexpectedMatch: needle });
  }
}

expectIncludes("private async handleSupportIssueFollowUp(", "support follow-up helper exists");
expectIncludes("state.last_support_issue", "support flow uses conversation support state");
expectIncludes("Please also share clear photos or videos of the damaged items and packaging", "damaged follow-up stays in support lane");
expectIncludes('{ label: "WhatsApp Support", value: "How can I contact support?" }', "support buttons use WhatsApp support");
expectNotIncludes(
  '{ label: "Track Order", value: "track my order" },\n              { label: "Home", value: "home" },\n            ],\n            skipSuggestions: true,\n          }),\n        };\n      case "general_brand_query"',
  "support request no longer offers track order shortcut",
);

const totalAssertions = 5;
console.log(`Ran ${totalAssertions} support claim flow checks.`);
console.log(`Passed: ${totalAssertions - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
