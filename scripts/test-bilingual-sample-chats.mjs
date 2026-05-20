import mod from "../apps/chatbot/src/server/services/support-agent.service.ts";

const { supportAgentService } = mod;

const failures = [];

async function getMessage(userId, message) {
  const result = await supportAgentService.handleChat({ userId, message });
  try {
    const parsed = JSON.parse(result.response);
    return String(parsed.message || "");
  } catch {
    return String(result.response || "");
  }
}

const cases = [
  {
    userId: "sample-spicy-ur",
    message: "Bhai spicy snacks batao.",
    mustInclude: [
      "Agar aapko spicy snacks pasand hain",
      "Stix Hot & Spicy",
      "Aapka budget kya hai",
    ],
  },
  {
    userId: "sample-spicy-ur",
    message: "2000 ke andar batao.",
    mustInclude: [
      "Rs. 2,000 ke andar",
      "Snack Sampler Deal",
      "Choco Stick ya Wafer Rolls",
    ],
  },
  {
    userId: "sample-order-ur",
    message: "Mera order kahan hai?",
    mustInclude: [
      "Zaroor, main help karta hoon",
      "order number ya checkout wala phone number",
    ],
  },
  {
    userId: "sample-order-ur",
    message: "Order number nahi hai.",
    mustInclude: [
      "No problem",
      "checkout ke time use kiya tha",
    ],
  },
  {
    userId: "sample-allergy-ur",
    message: "Is Choco Stick me nuts hain? Mere bachay ko allergy hai.",
    mustInclude: [
      "Serious allergy ke case me main guess nahi karna chahta",
      "support se connect",
    ],
  },
  {
    userId: "sample-price-ur",
    message: "Ye snacks expensive hain.",
    mustInclude: [
      "Snakitos quality ingredients",
      "bundle choose karna zyada acha rahega",
      "Aapka budget kya hai",
    ],
  },
  {
    userId: "sample-damage-ur",
    message: "Mera order damaged aya hai. Items tootay hue hain.",
    mustInclude: [
      "order arrived damaged",
      "photos ya videos",
      "replacement ya correction",
    ],
  },
  {
    userId: "sample-damage-ur",
    message: "Mujhe refund chahiye.",
    mustInclude: [
      "refund directly approve nahi kar sakta",
      "order number, photos/videos, aur issue details",
    ],
  },
  {
    userId: "sample-spicy-en",
    message: "Show me spicy snacks.",
    mustInclude: [
      "If you enjoy spicy snacks",
      "Want me to suggest a spicy combo under your budget?",
    ],
  },
  {
    userId: "sample-spicy-en",
    message: "Under 2000.",
    mustInclude: [
      "Under Rs. 2,000",
      "Choco Stick or Wafer Rolls",
    ],
  },
  {
    userId: "sample-order-en",
    message: "Where is my order?",
    mustInclude: [
      "Sure, I can help track it",
      "order number or the phone number used",
    ],
  },
  {
    userId: "sample-order-en",
    message: "I don't have order number.",
    mustInclude: [
      "No problem",
      "phone number you used at checkout",
    ],
  },
  {
    userId: "sample-allergy-en",
    message: "Does Choco Stick contain nuts? My child has an allergy.",
    mustInclude: [
      "I don’t want to guess",
      "confirmed allergen information",
    ],
  },
  {
    userId: "sample-price-en",
    message: "These snacks are expensive.",
    mustInclude: [
      "quality ingredients",
      "What’s your budget?",
    ],
  },
  {
    userId: "sample-damage-en",
    message: "My order arrived damaged. Items are broken.",
    mustInclude: [
      "order arrived damaged",
      "photos or videos",
      "replacement or correction",
    ],
  },
  {
    userId: "sample-damage-en",
    message: "I want a refund.",
    mustInclude: [
      "can’t approve a refund directly",
      "order number, photos/videos, and issue details",
    ],
  },
];

for (const testCase of cases) {
  const actual = await getMessage(testCase.userId, testCase.message);
  for (const expected of testCase.mustInclude) {
    if (!actual.toLowerCase().includes(expected.toLowerCase())) {
      failures.push({
        userId: testCase.userId,
        message: testCase.message,
        expectedToInclude: expected,
        actual,
      });
    }
  }
}

console.log(`Ran ${cases.length} bilingual sample chat checks.`);
console.log(`Passed: ${cases.length - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
