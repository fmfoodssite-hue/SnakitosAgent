import mod from "../apps/chatbot/src/server/services/support-agent.service.ts";

const { supportAgentService } = mod;

const failures = [];

async function getMessage(userId, message) {
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

const flows = [
  {
    name: "halal_followup",
    userId: "context-link-halal-user",
    steps: [
      { message: "halal", expect: "halal certification" },
      {
        message: "banana chips",
        expect: "halal",
        reject: "spicy, mild, or a combo option",
      },
    ],
  },
  {
    name: "ingredients_followup",
    userId: "context-link-ingredients-user",
    steps: [
      { message: "ingredients", expect: "Which product are you asking about" },
      {
        message: "stix",
        expect: "usually made with",
        reject: "spicy, mild, or a combo option",
      },
    ],
  },
  {
    name: "vegan_followup",
    userId: "context-link-vegan-user",
    steps: [
      { message: "vegan hai", expect: "vegetarian-friendly" },
      {
        message: "wafer rolls",
        expect: "vegetarian or vegan",
        reject: "pairs nicely with a related snack",
      },
    ],
  },
  {
    name: "storage_followup",
    userId: "context-link-storage-user",
    steps: [
      { message: "how to store", expect: "cool, dry place" },
      {
        message: "banana chips",
        expect: "cool, dry place",
        reject: "spicy, mild, or a combo option",
      },
    ],
  },
];

for (const flow of flows) {
  for (const step of flow.steps) {
    const actual = await getMessage(flow.userId, step.message);
    if (!actual.toLowerCase().includes(step.expect.toLowerCase())) {
      failures.push({
        flow: flow.name,
        step: step.message,
        expectedToInclude: step.expect,
        actual,
      });
    }

    if (step.reject && actual.toLowerCase().includes(step.reject.toLowerCase())) {
      failures.push({
        flow: flow.name,
        step: step.message,
        unexpected: step.reject,
        actual,
      });
    }
  }
}

console.log(`Ran ${flows.reduce((sum, flow) => sum + flow.steps.length, 0)} contextual query linking checks.`);
console.log(`Passed: ${flows.reduce((sum, flow) => sum + flow.steps.length, 0) - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
