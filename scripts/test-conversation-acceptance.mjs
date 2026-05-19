import mod from "../apps/chatbot/src/server/services/support-agent.service.ts";

const { supportAgentService } = mod;

const cases = [
  {
    message: "What do you sell?",
    mustInclude: "Snakitos offers snacks like Stix",
  },
  {
    message: "Recommend something.",
    mustInclude: "What are you craving",
  },
  {
    message: "Best seller?",
    mustInclude: "Some popular choices include",
  },
  {
    message: "I'm new here.",
    mustInclude: "starting with a mixed bundle",
  },
  {
    message: "Are your products halal?",
    mustInclude: "publicly lists Halal certification",
  },
  {
    message: "Do you have ISO?",
    mustInclude: "ISO 22000",
  },
  {
    message: "What ingredients are used?",
    mustInclude: "Ingredients vary by product",
  },
  {
    message: "Do your snacks contain nuts?",
    mustInclude: "Allergen information can vary by product",
  },
  {
    message: "Are these safe for kids?",
    mustInclude: "Kids Fun Box",
  },
  {
    message: "Need snacks for movie night.",
    mustInclude: "How many people are you ordering for",
  },
  {
    message: "What are your delivery charges?",
    mustInclude: "calculated at checkout",
  },
  {
    message: "Where is my order?",
    mustInclude: "I can check your order for you.",
  },
  {
    message: "Do you offer COD?",
    mustInclude: "I don’t have confirmed Cash on Delivery information",
  },
  {
    message: "My payment failed.",
    mustInclude: "please keep a screenshot or transaction ID",
  },
  {
    message: "Can I return my order?",
    mustInclude: "returns may be limited for hygiene and safety reasons",
  },
  {
    message: "Any discount code?",
    mustInclude: "Current discounts and offers may change",
  },
  {
    message: "This product is out of stock. When will it return?",
    mustInclude: "not fully sure about live stock or restock timing",
  },
  {
    message: "Do you offer wholesale?",
    mustInclude: "Wholesale or bulk pricing may be available",
  },
  {
    message: "I'm confused.",
    mustInclude: "do you want spicy, sweet, kids-friendly, movie-night, office, or mixed snacks",
  },
  {
    message: "Your service is terrible.",
    mustInclude: "forwarding this to our support team",
  },
  {
    message: "What's your budget?",
    mustInclude: "What’s your budget?",
  },
  {
    message: "Would you like me to take you to this product?",
    mustInclude: "Open on Snakitos",
  },
];

const failures = [];

for (const testCase of cases) {
  const result = await supportAgentService.handleChat({
    message: testCase.message,
    userId: "conversation-acceptance-test-user",
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

console.log(`Ran ${cases.length} conversation acceptance checks.`);
console.log(`Passed: ${cases.length - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
