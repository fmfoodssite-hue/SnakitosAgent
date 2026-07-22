import mod from "../apps/chatbot/src/server/services/support-agent.service.ts";

const { supportAgentService } = mod;

const userId = "support-spicy-reset-test-user";
const failures = [];

async function getMessage(message) {
  const result = await supportAgentService.handleChat({
    message,
    userId,
  });

  try {
    const parsed = JSON.parse(result.response);
    return String(parsed.message || "");
  } catch {
    return String(result.response || "");
  }
}

const steps = [
  {
    message: "Show me talk to support.",
    mustInclude: "WhatsApp at +92-343-6366369",
  },
  {
    message: "Are your snacks spicy?",
    mustInclude: "Stix Hot & Spicy",
    mustNotInclude: "remaining issue details with support",
  },
  {
    message: "Which one is very spicy?",
    mustInclude: "spiciest picks",
    mustNotInclude: "remaining issue details with support",
  },
];

for (const step of steps) {
  const actual = await getMessage(step.message);
  if (!actual.toLowerCase().includes(step.mustInclude.toLowerCase())) {
    failures.push({
      step: step.message,
      expectedToInclude: step.mustInclude,
      actual,
    });
  }

  if (
    step.mustNotInclude &&
    actual.toLowerCase().includes(step.mustNotInclude.toLowerCase())
  ) {
    failures.push({
      step: step.message,
      unexpected: step.mustNotInclude,
      actual,
    });
  }
}

console.log(`Ran ${steps.length} support-to-spicy reset checks.`);
console.log(`Passed: ${steps.length - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
