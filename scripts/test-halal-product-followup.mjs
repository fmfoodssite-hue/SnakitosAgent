import mod from "../apps/chatbot/src/server/services/support-agent.service.ts";

const { supportAgentService } = mod;

const userId = "halal-followup-test-user";
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

const firstReply = await getMessage("halal");
if (!firstReply.toLowerCase().includes("halal certification")) {
  failures.push({
    step: "halal",
    expectedToInclude: "halal certification",
    actual: firstReply,
  });
}

const secondReply = await getMessage("banana chips");
if (!secondReply.toLowerCase().includes("halal")) {
  failures.push({
    step: "banana chips",
    expectedToInclude: "halal",
    actual: secondReply,
  });
}

if (secondReply.toLowerCase().includes("spicy, mild, or a combo option")) {
  failures.push({
    step: "banana chips",
    unexpected: "spicy, mild, or a combo option",
    actual: secondReply,
  });
}

console.log("Ran 2 halal follow-up checks.");
console.log(`Passed: ${2 - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
