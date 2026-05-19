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

const certificationUser = "certification-followup-test-user";

const certificationReply = await getMessage(
  certificationUser,
  "Do you have halal certification? Which authority certified you?",
);

if (!certificationReply.toLowerCase().includes("iso 22000")) {
  failures.push({
    step: "certification question",
    expectedToInclude: "ISO 22000",
    actual: certificationReply,
  });
}

const stiksReply = await getMessage(certificationUser, "stiks");

if (!stiksReply.toLowerCase().includes("halal")) {
  failures.push({
    step: "stiks follow-up",
    expectedToInclude: "halal",
    actual: stiksReply,
  });
}

if (stiksReply.toLowerCase().includes("fresh stock")) {
  failures.push({
    step: "stiks follow-up",
    unexpected: "fresh stock",
    actual: stiksReply,
  });
}

const dailyUser = "daily-snacks-route-test-user";
const dailyReply = await getMessage(dailyUser, "show me daily snacks");

if (!dailyReply.toLowerCase().includes("daily snacking")) {
  failures.push({
    step: "daily snacks",
    expectedToInclude: "daily snacking",
    actual: dailyReply,
  });
}

if (dailyReply.toLowerCase().includes("welcome back")) {
  failures.push({
    step: "daily snacks",
    unexpected: "Welcome back",
    actual: dailyReply,
  });
}

console.log("Ran 4 certification typo/daily route checks.");
console.log(`Passed: ${4 - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
