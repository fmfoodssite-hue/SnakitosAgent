import mod from "../apps/chatbot/src/server/services/support-agent.service.ts";

const { supportAgentService } = mod;

const cases = [
  {
    message: "dilevry",
    mustInclude: "Delivery usually takes 2-5 business days",
  },
  {
    message: "shiping chrges",
    mustInclude: "calculated at checkout",
  },
  {
    message: "traking kidar hai",
    mustInclude: "I can check your order for you.",
  },
  {
    message: "refnd",
    mustInclude: "returns and refunds may be limited",
  },
  {
    message: "riturn krna",
    mustInclude: "returns may be limited",
  },
  {
    message: "Kids ke liye kya acha hai?",
    mustInclude: "Kids Fun Box",
  },
  {
    message: "spcy snacks",
    mustInclude: "spicy snacks",
  },
  {
    message: "bnana chips",
    mustInclude: "Banana Chips",
  },
  {
    message: "waffer roll",
    mustInclude: "Wafer Rolls",
  },
  {
    message: "Do you have ISO?",
    mustInclude: "ISO 22000",
  },
  {
    message: "coupon nahi lag raha",
    mustInclude: "coupon is still valid",
  },
  {
    message: "I ordered before. What should I try now?",
    mustInclude: "Welcome back",
  },
  {
    message: "Talk to agent.",
    mustInclude: "connect you with Snakitos support",
  },
  {
    message: "Why should I buy from Snakitos?",
    mustInclude: "brand by FM Foods",
  },
];

const failures = [];

for (const testCase of cases) {
  const result = await supportAgentService.handleChat({
    message: testCase.message,
    userId: "phrase-coverage-test-user",
  });

  let parsed;
  try {
    parsed = JSON.parse(result.response);
  } catch {
    parsed = { message: result.response };
  }

  const message = String(parsed.message || "");
  if (!message.toLowerCase().includes(testCase.mustInclude.toLowerCase())) {
    failures.push({
      case: testCase.message,
      expectedToInclude: testCase.mustInclude,
      actual: message,
    });
  }
}

console.log(`Ran ${cases.length} phrase coverage checks.`);
console.log(`Passed: ${cases.length - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
