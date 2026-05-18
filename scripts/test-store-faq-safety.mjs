import fs from "node:fs";
import path from "node:path";
import faqKnowledge from "../apps/chatbot/src/server/data/store-faq-knowledge.json" with { type: "json" };

const repoRoot = path.resolve(import.meta.dirname, "..");
const supportAgentPath = path.join(
  repoRoot,
  "apps",
  "chatbot",
  "src",
  "server",
  "services",
  "support-agent.service.ts",
);

const supportAgentSource = fs.readFileSync(supportAgentPath, "utf8");
const failures = [];

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    failures.push({ label, expected, actual });
  }
}

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

function getEntry(id) {
  return faqKnowledge.find((entry) => entry.id === id);
}

expectEqual(
  getEntry("store-delivery-timeline")?.text,
  "Orders are processed within 1-2 business days after payment confirmation. Delivery usually takes 2-5 business days from the date of order fulfillment, depending on the destination city.",
  "delivery timeline fact",
);

expectEqual(
  getEntry("store-refund-return")?.text,
  "Eligible returns are allowed within 14 calendar days from receiving the item. The item must be unused and in the original packaging. Food products are non-refundable unless they are defective or damaged on arrival. Exchanges are only for defective or damaged items, and approved refunds go back to the original payment method.",
  "refund policy fact",
);

expectEqual(
  getEntry("store-support-contact")?.text,
  "Customers can contact Snakitos at info@snakitos.com. Public contact numbers shown on the website include +92-345-8283825 and +92-345-8283827. The listed address is A-50, S.I.T.E., Karachi, Pakistan.",
  "contact fact",
);

expectIncludes(
  getEntry("store-nutrition-health-guidance")?.text ?? "",
  "does not confirm exact nutrition facts",
  "nutrition guidance exists",
);

expectIncludes(
  supportAgentSource,
  "I don’t have confirmed Cash on Delivery information in the current public policy.",
  "cod reply softened",
);

expectIncludes(
  supportAgentSource,
  "The current public shipping policy does not confirm same-day delivery.",
  "same-day reply softened",
);

expectIncludes(
  supportAgentSource,
  "Based on current Snakitos store knowledge, the products are handled as halal.",
  "halal wording softened",
);

expectNotIncludes(
  supportAgentSource,
  "Yes, Cash on Delivery is available across Pakistan.",
  "old cod claim removed",
);

expectNotIncludes(
  supportAgentSource,
  "Yes, same-day delivery is possible in Karachi with advance payment.",
  "old same-day claim removed",
);

expectNotIncludes(
  supportAgentSource,
  "Yes, online payments are handled with standard checkout security.",
  "old payment security claim removed",
);

expectNotIncludes(
  supportAgentSource,
  "Yes, our products are halal and approved by Pakistan Halal Authority (PHA) and Sindh.",
  "old halal approval claim removed",
);

const totalAssertions = 11;
console.log(`Ran ${totalAssertions} store FAQ safety checks.`);
console.log(`Passed: ${totalAssertions - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
