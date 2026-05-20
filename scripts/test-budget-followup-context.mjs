import mod from "../apps/chatbot/src/server/services/support-agent.service.ts";

const { supportAgentService } = mod;

const userId = "budget-followup-context-test-user";
const failures = [];

async function getResponse(message) {
  const result = await supportAgentService.handleChat({
    message,
    userId,
  });

  try {
    return JSON.parse(result.response);
  } catch {
    return { message: String(result.response || "") };
  }
}

const first = await getResponse("Bhai spicy snacks batao.");
const firstMessage = String(first.message || "");

if (
  !firstMessage
    .toLowerCase()
    .includes("want me to suggest a spicy combo under your budget")
) {
  failures.push({
    step: "Bhai spicy snacks batao.",
    expectedToInclude: "Want me to suggest a spicy combo under your budget?",
    actual: firstMessage,
  });
}

const second = await getResponse("1000");
const secondMessage = String(second.message || "");

if (!secondMessage.toLowerCase().includes("under rs. 1,000")) {
  failures.push({
    step: "1000",
    expectedToInclude: "Under Rs. 1,000",
    actual: secondMessage,
  });
}

for (const unexpected of [
  "trigger:",
  "primary:",
  "snakitos products should be handled as fresh stock",
]) {
  if (secondMessage.toLowerCase().includes(unexpected.toLowerCase())) {
    failures.push({
      step: "1000",
      unexpected,
      actual: secondMessage,
    });
  }
}

if (!Array.isArray(second.products) || second.products.length === 0) {
  failures.push({
    step: "1000",
    expected: "budget recommendations should include product cards",
    actualProducts: second.products,
  });
}

console.log("Ran 2 budget follow-up context checks.");
console.log(`Passed: ${2 - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
