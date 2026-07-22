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
expectIncludes('!["damaged_product", "wrong_product", "payment_failed"].includes(', "generic support request is not sticky");
expectIncludes('extractOrderReference(userMessage) || extractPhoneNumber(userMessage)', "support follow-up only reacts to explicit message references");
expectIncludes("Please also share clear photos or videos of the damaged items and packaging", "damaged follow-up stays in support lane");
expectIncludes('Sure, you can contact Snakitos support on WhatsApp at +92-343-6366369. You can also email info@snakitos.com.', "support request shows direct whatsapp details");
expectIncludes('{ label: "WhatsApp Support", value: "whatsapp support number" }', "support buttons use direct whatsapp action");
expectIncludes('You can contact Snakitos support on WhatsApp at +92-343-6366369. You can also email info@snakitos.com or call +92-343-6363665 / +92-343-6363669.', "contact response includes whatsapp and phone numbers");
expectNotIncludes(
  '{ label: "Track Order", value: "track my order" },\n              { label: "Home", value: "home" },\n            ],\n            skipSuggestions: true,\n          }),\n        };\n      case "general_brand_query"',
  "support request no longer offers track order shortcut",
);

const totalAssertions = 8;
console.log(`Ran ${totalAssertions} support claim flow checks.`);
console.log(`Passed: ${totalAssertions - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
