/**
 * 10K Test Cases for Product Search based on Pricing & Taste Events
 * Comprehensive test suite for product queries with various price ranges and taste preferences
 */

// Product types and taste categories
const productTypes = [
  "Nachos",
  "Sweet Snacks",
  "Potato Snacks",
  "Snacks",
  "Multigrain Stix",
  "Chips",
  "Wafers",
  "Cookies",
  "Chocolate",
  "Crisps"
];

const tasteEvents = [
  "movie night",
  "office party",
  "movie marathon",
  "tea time",
  "night cravings",
  "gift",
  "family gathering",
  "game night",
  "snack time",
  "late night",
  "morning snack",
  "evening munch",
  "party",
  "birthday",
  "wedding",
  "casual snacking"
];

const tastingPreferences = [
  "spicy",
  "sweet",
  "salty",
  "savory",
  "cheesy",
  "chocolate",
  "crispy",
  "crunchy",
  "soft",
  "tangy",
  "mild",
  "extra spicy"
];

const priceRanges = [
  { min: 0, max: 50, label: "budget" },
  { min: 50, max: 100, label: "economy" },
  { min: 100, max: 200, label: "mid-range" },
  { min: 200, max: 500, label: "premium" },
  { min: 500, max: 1000, label: "ultra-premium" }
];

const queryPatterns = [
  (product, taste) => `show me ${product} for ${taste}`,
  (product, taste) => `best ${product} for ${taste}`,
  (product, taste) => `${product} recommendations for ${taste}`,
  (product, taste) => `what ${product} do you have for ${taste}`,
  (product, taste) => `${taste} ${product} suggestions`,
  (product, taste) => `perfect ${product} for ${taste}`,
  (product, taste) => `${product} deals for ${taste}`,
  (product, taste) => `popular ${product} for ${taste}`,
  (taste, product) => `need ${product} for ${taste}`,
  (product, taste) => `which ${product} is best for ${taste}`,
  (product, taste) => `${product} bundle for ${taste}`,
  (product, taste) => `combo ${product} for ${taste}`,
  (product, taste) => `spicy vs sweet ${product} for ${taste}`,
  (product, taste) => `cheapest ${product} for ${taste}`,
  (product, taste) => `premium ${product} for ${taste}`,
];

const priceQueries = [
  (min, max, product) => `${product} between ${min} and ${max} rupees`,
  (min, max, product) => `${product} under ${max} rupees`,
  (min, max, product) => `${product} price ${min} to ${max}`,
  (min, max, product) => `${product} under ${max}`,
  (min, max, product) => `${product} in price range ${min}-${max}`,
  (min, max, product) => `show me ${product} for less than ${max}`,
  (min, max, product) => `${product} deals under ${max}`,
  (min, max, product) => `affordable ${product} under ${max}`,
];

/**
 * Generate 10,000 test cases
 */
function generateTestCases() {
  const testCases = [];
  const seenQueries = new Set();

  // 1. Product type + Taste event combinations (base scenarios)
  for (const product of productTypes) {
    for (const taste of tasteEvents) {
      for (const pattern of queryPatterns) {
        const query = pattern(product, taste);
        if (!seenQueries.has(query)) {
          testCases.push({
            id: testCases.length + 1,
            query,
            type: "product_taste",
            product,
            taste,
            expectedFields: ["title", "price", "productType", "vendor"]
          });
          seenQueries.add(query);
        }
      }
    }
  }

  // 2. Price range + Product combinations
  for (const product of productTypes) {
    for (const range of priceRanges) {
      for (const priceQuery of priceQueries) {
        const query = priceQuery(range.min, range.max, product);
        if (!seenQueries.has(query) && testCases.length < 3000) {
          testCases.push({
            id: testCases.length + 1,
            query,
            type: "price_range",
            product,
            priceRange: range.label,
            minPrice: range.min,
            maxPrice: range.max,
            expectedFields: ["title", "price", "productType"]
          });
          seenQueries.add(query);
        }
      }
    }
  }

  // 3. Taste preferences + Product combinations
  for (const product of productTypes) {
    for (const preference of tastingPreferences) {
      const queries = [
        `${preference} ${product}`,
        `best ${preference} ${product}`,
        `${preference} flavour ${product}`,
        `show me ${preference} ${product}`,
        `what ${preference} ${product} do you have`,
        `${product} with ${preference} taste`,
        `${product} ${preference} options`,
        `${preference} snacks like ${product}`,
      ];
      
      for (const query of queries) {
        if (!seenQueries.has(query) && testCases.length < 5000) {
          testCases.push({
            id: testCases.length + 1,
            query,
            type: "taste_preference",
            product,
            taste: preference,
            expectedFields: ["title", "price", "productType", "tags"]
          });
          seenQueries.add(query);
        }
      }
    }
  }

  // 4. Occasion + Budget combinations
  const occasions = tasteEvents;
  for (const occasion of occasions) {
    for (const range of priceRanges) {
      const queries = [
        `${range.label} snacks for ${occasion}`,
        `${occasion} snacks ${range.label} option`,
        `${range.label} products for ${occasion}`,
        `best ${range.label} snacks for ${occasion}`,
      ];
      
      for (const query of queries) {
        if (!seenQueries.has(query) && testCases.length < 7000) {
          testCases.push({
            id: testCases.length + 1,
            query,
            type: "occasion_budget",
            occasion,
            budget: range.label,
            priceRange: `${range.min}-${range.max}`,
            expectedFields: ["title", "price", "vendor"]
          });
          seenQueries.add(query);
        }
      }
    }
  }

  // 5. Combined taste preference + taste event scenarios
  for (const preference of tastingPreferences) {
    for (const event of tasteEvents) {
      const queries = [
        `${preference} snacks for ${event}`,
        `${event} with ${preference} taste`,
        `best ${preference} options for ${event}`,
        `${preference} and ${event} suggestions`,
        `snacks for ${event} - ${preference} flavour`,
        `${preference} choice for ${event}`,
        `${event} need ${preference} snacks`,
        `give me ${preference} snacks perfect for ${event}`,
      ];
      
      for (const query of queries) {
        if (!seenQueries.has(query) && testCases.length < 9000) {
          testCases.push({
            id: testCases.length + 1,
            query,
            type: "taste_event_combo",
            preference,
            event,
            expectedFields: ["title", "price", "description", "tags"]
          });
          seenQueries.add(query);
        }
      }
    }
  }

  // 6. Variation queries to reach 10k
  const variationQueries = [
    "show all products",
    "what products do you have",
    "best sellers",
    "top products",
    "most popular",
    "featured products",
    "deals and offers",
    "product catalog",
    "all snacks available",
    "store inventory",
    "complete product list",
    "product recommendations",
    "trending snacks",
    "best rated products",
    "customer favorites",
  ];

  for (const query of variationQueries) {
    if (!seenQueries.has(query) && testCases.length < 10000) {
      testCases.push({
        id: testCases.length + 1,
        query,
        type: "general",
        expectedFields: ["title", "price", "vendor", "productType"]
      });
      seenQueries.add(query);
    }
  }

  // Fill remaining slots with random combinations
  while (testCases.length < 10000) {
    const randomProduct = productTypes[Math.floor(Math.random() * productTypes.length)];
    const randomTaste = tasteEvents[Math.floor(Math.random() * tasteEvents.length)];
    const randomPreference = tastingPreferences[Math.floor(Math.random() * tastingPreferences.length)];
    const randomRange = priceRanges[Math.floor(Math.random() * priceRanges.length)];
    
    const randomQueries = [
      `find ${randomProduct} for ${randomTaste}`,
      `${randomPreference} ${randomProduct} under ${randomRange.max}`,
      `${randomTaste} - ${randomPreference} ${randomProduct}`,
      `best ${randomProduct} ${randomPreference} for ${randomTaste}`,
      `${randomProduct} perfect for ${randomTaste} ${randomPreference}`,
    ];
    
    const randomQuery = randomQueries[Math.floor(Math.random() * randomQueries.length)];
    
    if (!seenQueries.has(randomQuery)) {
      testCases.push({
        id: testCases.length + 1,
        query: randomQuery,
        type: "random_combo",
        product: randomProduct,
        taste: randomTaste,
        preference: randomPreference,
        priceRange: randomRange.label,
        expectedFields: ["title", "price", "productType"]
      });
      seenQueries.add(randomQuery);
    }
  }

  return testCases.slice(0, 10000);
}

/**
 * Group test cases by type for analysis
 */
function groupTestCasesByType(testCases) {
  const grouped = {};
  
  for (const testCase of testCases) {
    if (!grouped[testCase.type]) {
      grouped[testCase.type] = [];
    }
    grouped[testCase.type].push(testCase);
  }
  
  return grouped;
}

/**
 * Generate statistics about the test cases
 */
function generateStatistics(testCases) {
  const grouped = groupTestCasesByType(testCases);
  const stats = {
    totalTests: testCases.length,
    byType: {},
    uniqueQueries: new Set(testCases.map(t => t.query)).size,
  };

  for (const [type, cases] of Object.entries(grouped)) {
    stats.byType[type] = cases.length;
  }

  return stats;
}

// Generate test cases
const allTestCases = generateTestCases();
const stats = generateStatistics(allTestCases);

// Export for use in other scripts
export { allTestCases, stats, generateTestCases, groupTestCasesByType, generateStatistics };

// Run only if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("🚀 Generating 10,000 product test cases...\n");
  console.log("✅ Test Generation Complete!\n");
  console.log("📊 Statistics:");
  console.log(`   Total Test Cases: ${stats.totalTests}`);
  console.log(`   Unique Queries: ${stats.uniqueQueries}`);
  console.log(`   Breakdown by Type:`);
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`     - ${type}: ${count}`);
  }

  // Show sample of test cases
  console.log("\n📋 Sample Test Cases (first 20):");
  allTestCases.slice(0, 20).forEach((testCase, index) => {
    console.log(`  ${index + 1}. [${testCase.type}] "${testCase.query}"`);
  });

  console.log("\n📋 Sample Test Cases (middle 20):");
  allTestCases.slice(5000, 5020).forEach((testCase, index) => {
    console.log(`  ${5001 + index}. [${testCase.type}] "${testCase.query}"`);
  });

  console.log("\n📋 Sample Test Cases (last 20):");
  allTestCases.slice(-20).forEach((testCase, index) => {
    console.log(`  ${allTestCases.length - 19 + index}. [${testCase.type}] "${testCase.query}"`);
  });

  console.log("\n✨ Test suite is ready for execution!");
}
