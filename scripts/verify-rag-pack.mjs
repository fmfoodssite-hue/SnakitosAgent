import fs from "fs";
import path from "path";

const filePath = process.argv[2];
const endpoint = process.argv[3] ?? "http://localhost:3000/api/chat";
const concurrency = Number.parseInt(process.argv[4] ?? "4", 10);

if (!filePath) {
  console.error("Usage: node scripts/verify-rag-pack.mjs <jsonl-path> [endpoint] [concurrency]");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8").trim();
const cases = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

function normalizeExpectedIntent(expectedIntent) {
  const value = String(expectedIntent || "").toUpperCase();
  if (value === "HUMAN_SUPPORT") {
    return "HUMAN_SUPPORT";
  }
  return value;
}

function normalizeActualIntent(result) {
  return String(result?.intent || "").toUpperCase();
}

function extractMessage(response) {
  try {
    const parsed = JSON.parse(response);
    return String(parsed?.message || response);
  } catch {
    return String(response || "");
  }
}

function looksLikeHumanSupport(message) {
  const normalized = message.toLowerCase();
  return [
    "support team",
    "contact support",
    "whatsapp",
    "sorry about the inconvenience",
    "share your order number",
    "faster assistance",
    "contact support right away",
  ].some((signal) => normalized.includes(signal));
}

function containsForbidden(message) {
  const normalized = message.toLowerCase();
  return [
    "share your otp",
    "send your otp",
    "send your password",
    "share your password",
    "full card number",
    "refund approved",
    "guaranteed delivery tomorrow",
  ].some((signal) => normalized.includes(signal));
}

function evaluateCase(testCase, result) {
  const expectedIntent = normalizeExpectedIntent(testCase.expected_intent);
  const actualIntent = normalizeActualIntent(result);
  const answer = extractMessage(result.response);

  let intentPass = false;
  if (expectedIntent === "HUMAN_SUPPORT") {
    intentPass = looksLikeHumanSupport(answer);
  } else {
    intentPass = actualIntent === expectedIntent;
  }

  const forbiddenPass = !containsForbidden(answer);
  return {
    testId: testCase.test_id,
    query: testCase.user_query,
    expectedIntent,
    actualIntent,
    answer,
    pass: intentPass && forbiddenPass,
    intentPass,
    forbiddenPass,
  };
}

async function callChatbot(testCase) {
  const payload = {
    message: testCase.user_query,
    userId: `verify-${testCase.test_id}`,
    chatId: `verify-${testCase.expected_intent?.toLowerCase?.() ?? "case"}`,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return data;
}

async function runWorker(queue, results) {
  while (queue.length > 0) {
    const testCase = queue.shift();
    if (!testCase) {
      return;
    }

    try {
      const result = await callChatbot(testCase);
      results.push(evaluateCase(testCase, result));
    } catch (error) {
      results.push({
        testId: testCase.test_id,
        query: testCase.user_query,
        expectedIntent: normalizeExpectedIntent(testCase.expected_intent),
        actualIntent: "ERROR",
        answer: error instanceof Error ? error.message : "Unknown error",
        pass: false,
        intentPass: false,
        forbiddenPass: true,
      });
    }
  }
}

function summarize(results) {
  const summary = {
    total: results.length,
    pass: results.filter((item) => item.pass).length,
    fail: results.filter((item) => !item.pass).length,
    byIntent: {},
  };

  for (const result of results) {
    const key = result.expectedIntent;
    if (!summary.byIntent[key]) {
      summary.byIntent[key] = { total: 0, pass: 0, fail: 0 };
    }

    summary.byIntent[key].total += 1;
    if (result.pass) {
      summary.byIntent[key].pass += 1;
    } else {
      summary.byIntent[key].fail += 1;
    }
  }

  return summary;
}

async function main() {
  const queue = [...cases];
  const results = [];
  const workers = Array.from({ length: Math.max(1, concurrency) }, () =>
    runWorker(queue, results),
  );

  await Promise.all(workers);

  const summary = summarize(results);
  const failures = results.filter((item) => !item.pass).slice(0, 50);
  const outPath = path.resolve(
    process.cwd(),
    `scripts/rag-verification-results-${Date.now()}.json`,
  );

  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        endpoint,
        summary,
        failures,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(JSON.stringify({ summary, outPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
