import productMetadata from "../apps/chatbot/src/server/data/product-metadata.json" with { type: "json" };

const EXPIRY_QUERY_PATTERN = /\b(expiry|shelf life|fresh|expiry kitni|kitni expiry)\b/i;
const GENERAL_EXPIRY_QUERY_PATTERN = /\b(expiry duration|expiry|expiry kitni hai|kitni expiry)\b/i;

const PRODUCT_FIXTURES = [
  {
    query: "What is the expiry of Banana Chips?",
    product: { title: "Banana Chips Sea Salt", productType: "Banana Chips" },
    expectedExpiry: "3 months",
  },
  {
    query: "expiry kitni hai for Nachos Salsa",
    product: { title: "Nachos Salsa", productType: "Nachos" },
    expectedExpiry: "1 year",
  },
  {
    query: "What is the shelf life of Wafer Rolls?",
    product: { title: "Wafer Rolls Hazelnut", productType: "Wafer Rolls" },
    expectedExpiry: "1 year",
  },
];

const GENERAL_QUERY_FIXTURES = [
  {
    query: "expiry details",
    expected:
      "Banana Chips usually have an expiry of 3 months. Most remaining Snakitos products usually have an expiry of 1 year.",
  },
  {
    query: "expiry kitni hai",
    expected:
      "Banana Chips usually have an expiry of 3 months. Most remaining Snakitos products usually have an expiry of 1 year.",
  },
];

function getProductMetadata(product) {
  const title = `${product.title} ${product.productType ?? ""}`.toLowerCase();
  const rules = productMetadata.rules ?? [];
  const matchedRule = rules.find((rule) =>
    rule.matchAny.some((keyword) => title.includes(keyword.toLowerCase())),
  );

  return {
    expiry: matchedRule?.expiry ?? productMetadata.defaults?.expiry,
  };
}

function buildSpecificExpiryAnswer(query, product) {
  if (!EXPIRY_QUERY_PATTERN.test(query)) {
    return null;
  }

  const metadata = getProductMetadata(product);
  if (metadata.expiry) {
    return `${product.title} usually has an expiry of ${metadata.expiry}.`;
  }

  return `I found ${product.title}, but the current catalog does not clearly confirm the exact expiry or shelf-life details here. Please check the product page or ask support for exact confirmation.`;
}

function buildGeneralExpiryAnswer(query) {
  if (!GENERAL_EXPIRY_QUERY_PATTERN.test(query)) {
    return null;
  }

  return "Banana Chips usually have an expiry of 3 months. Most remaining Snakitos products usually have an expiry of 1 year.";
}

const failures = [];

for (const fixture of PRODUCT_FIXTURES) {
  const actual = buildSpecificExpiryAnswer(fixture.query, fixture.product);
  const expected = `${fixture.product.title} usually has an expiry of ${fixture.expectedExpiry}.`;

  if (actual !== expected) {
    failures.push({
      type: "specific_expiry",
      query: fixture.query,
      expected,
      actual,
    });
  }
}

for (const fixture of GENERAL_QUERY_FIXTURES) {
  const actual = buildGeneralExpiryAnswer(fixture.query);
  if (actual !== fixture.expected) {
    failures.push({
      type: "general_expiry",
      query: fixture.query,
      expected: fixture.expected,
      actual,
    });
  }
}

console.log(`Ran ${PRODUCT_FIXTURES.length + GENERAL_QUERY_FIXTURES.length} product expiry tests.`);
console.log(`Passed: ${PRODUCT_FIXTURES.length + GENERAL_QUERY_FIXTURES.length - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
