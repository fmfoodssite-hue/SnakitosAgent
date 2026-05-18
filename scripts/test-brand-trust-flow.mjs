import mod from "../apps/chatbot/src/server/services/support-agent.service.ts";

const { supportAgentService } = mod;

const cases = [
  {
    message: "Why should I buy from Snakitos?",
    mustInclude: "Snakitos offers a wide range of Pakistani snacks",
    mustNotInclude: "I found these close matches",
  },
  {
    message: "why buy from snakitos",
    mustInclude: "Snakitos offers a wide range of Pakistani snacks",
    mustNotInclude: "I found these close matches",
  },
];

const failures = [];

for (const testCase of cases) {
  const result = await supportAgentService.handleChat({
    message: testCase.message,
    userId: "brand-trust-test-user",
  });

  let parsed;
  try {
    parsed = JSON.parse(result.response);
  } catch {
    parsed = { message: result.response };
  }

  const message = String(parsed.message || "");
  if (!message.includes(testCase.mustInclude)) {
    failures.push({
      case: testCase.message,
      reason: "missing expected trust guidance",
      expectedToInclude: testCase.mustInclude,
      actual: message,
    });
  }

  if (message.includes(testCase.mustNotInclude)) {
    failures.push({
      case: testCase.message,
      reason: "fell into product-match fallback",
      unexpectedMatch: testCase.mustNotInclude,
      actual: message,
    });
  }
}

console.log(`Ran ${cases.length} brand trust flow checks.`);
console.log(`Passed: ${cases.length - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
