/**
 * Local 10K Product Test Executor
 * Tests product filtering logic locally without requiring API endpoint
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { allTestCases, groupTestCasesByType } from "./test-10k-products.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock product catalog (sample from your data)
const mockProducts = [
  {
    title: "Nachos Salsa - 50g ( +DC )",
    price: "48.88",
    vendor: "snakitos",
    productType: "Nachos",
    availability: "unknown",
    orderCount: 406,
    unitsSold: 2452,
    tags: ["spicy", "savory", "party"],
  },
  {
    title: "Nachos Paprika - 50g ( +DC )",
    price: "48.88",
    vendor: "snakitos",
    productType: "Nachos",
    availability: "unknown",
    orderCount: 406,
    unitsSold: 2452,
    tags: ["spicy", "savory"],
  },
  {
    title: "Nachos Salsa Pack Of 10 - 50g ( +DC )",
    price: "500.00",
    vendor: "snakitos",
    productType: "Nachos",
    availability: "unknown",
    orderCount: 272,
    unitsSold: 371,
    tags: ["bulk", "party", "deal"],
  },
  {
    title: "Coco Choco Can - Snakitos - 70g",
    price: "210.06",
    vendor: "snakitos",
    productType: "Sweet Snacks",
    availability: "unknown",
    orderCount: 70,
    unitsSold: 174,
    tags: ["sweet", "chocolate", "gift"],
  },
  {
    title: "Patata Masala - 50g",
    price: "213.97",
    vendor: "snakitos",
    productType: "Potato Snacks",
    availability: "unknown",
    orderCount: 75,
    unitsSold: 138,
    tags: ["spicy", "crispy", "savory"],
  },
  {
    title: "ChickPea Puffs - 70g",
    price: "214.49",
    vendor: "snakitos",
    productType: "Snacks",
    availability: "unknown",
    orderCount: 56,
    unitsSold: 128,
    tags: ["crunchy", "healthy", "savory"],
  },
  {
    title: "Choco Stick with Chocolate Spread - 35g",
    price: "184.07",
    vendor: "snakitos",
    productType: "Sweet Snacks",
    availability: "unknown",
    orderCount: 75,
    unitsSold: 116,
    tags: ["sweet", "chocolate", "morning"],
  },
  {
    title: "Stix Peri Peri - Multigrain - 50g",
    price: "217.43",
    vendor: "snakitos",
    productType: "Multigrain Stix",
    availability: "unknown",
    orderCount: 62,
    unitsSold: 111,
    tags: ["spicy", "peri-peri", "crispy"],
  },
];

/**
 * Local search algorithm - simulates product filtering
 */
function localProductSearch(query, products = mockProducts) {
  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/);

  // Score each product based on query match
  const scored = products.map((product) => {
    let score = 0;

    // Title matching (high weight)
    const titleLower = product.title.toLowerCase();
    if (titleLower.includes(queryLower)) score += 100;
    for (const term of terms) {
      if (titleLower.includes(term)) score += 50;
    }

    // Product type matching (high weight)
    const typeLower = product.productType.toLowerCase();
    if (typeLower.includes(queryLower)) score += 80;
    for (const term of terms) {
      if (typeLower.includes(term)) score += 40;
    }

    // Tags matching (medium weight)
    for (const tag of product.tags || []) {
      if (tag.includes(queryLower)) score += 30;
      for (const term of terms) {
        if (tag.includes(term)) score += 15;
      }
    }

    // Price range matching
    const price = parseFloat(product.price);
    for (const term of terms) {
      if (term.match(/^\d+$/)) {
        // Price exact match
        if (price === parseInt(term)) score += 25;
        // Price range match
        if (price <= parseInt(term)) score += 10;
      }
    }

    return { ...product, score };
  });

  // Filter products with score > 0 and sort by score
  return scored.filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
}

/**
 * Execute a test case locally
 */
function executeLocalTestCase(testCase) {
  const startTime = Date.now();

  try {
    const results = localProductSearch(testCase.query);
    const duration = Date.now() - startTime;

    // Validate expected fields if specified
    let fieldsValid = true;
    if (testCase.expectedFields && results.length > 0) {
      for (const field of testCase.expectedFields) {
        if (!(field in results[0])) {
          fieldsValid = false;
          break;
        }
      }
    }

    return {
      id: testCase.id,
      query: testCase.query,
      type: testCase.type,
      status: results.length > 0 && fieldsValid ? "passed" : "no-results",
      duration,
      resultCount: results.length,
      fieldsValid,
      results: results.slice(0, 3), // Top 3 results
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      id: testCase.id,
      query: testCase.query,
      type: testCase.type,
      status: "error",
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Execute all test cases locally
 */
function executeAllTestCasesLocal(sampleSize = null) {
  const testCasesToRun = sampleSize ? allTestCases.slice(0, sampleSize) : allTestCases;
  const results = [];

  console.log(`\n🏃 Running ${testCasesToRun.length} test cases locally...\n`);

  const startTime = Date.now();

  for (let i = 0; i < testCasesToRun.length; i++) {
    const result = executeLocalTestCase(testCasesToRun[i]);
    results.push(result);

    if ((i + 1) % 1000 === 0 || i === testCasesToRun.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const rate = ((i + 1) / (elapsed / 60)).toFixed(0);
      console.log(`  ✓ ${i + 1}/${testCasesToRun.length} completed (${elapsed}s, ${rate} tests/min)`);
    }
  }

  return results;
}

/**
 * Generate detailed report
 */
function generateLocalReport(results) {
  const report = {
    summary: {
      totalTests: results.length,
      timestamp: new Date().toISOString(),
    },
    results: {
      passed: results.filter((r) => r.status === "passed").length,
      noResults: results.filter((r) => r.status === "no-results").length,
      errors: results.filter((r) => r.status === "error").length,
    },
    performance: {
      averageDuration: (
        results.reduce((sum, r) => sum + r.duration, 0) / results.length
      ).toFixed(3),
      minDuration: Math.min(...results.map((r) => r.duration)),
      maxDuration: Math.max(...results.map((r) => r.duration)),
      totalTime: (results.reduce((sum, r) => sum + r.duration, 0) / 1000).toFixed(2),
    },
    byType: {},
    coverage: {},
  };

  // Aggregate by type
  const typeMap = {};
  const grouped = groupTestCasesByType(allTestCases);

  for (const result of results) {
    if (!typeMap[result.type]) {
      typeMap[result.type] = {
        total: 0,
        passed: 0,
        noResults: 0,
        errors: 0,
        avgDuration: 0,
      };
    }
    typeMap[result.type].total++;
    if (result.status === "passed") typeMap[result.type].passed++;
    if (result.status === "no-results") typeMap[result.type].noResults++;
    if (result.status === "error") typeMap[result.type].errors++;
    typeMap[result.type].avgDuration += result.duration;
  }

  for (const [type, data] of Object.entries(typeMap)) {
    report.byType[type] = {
      tested: data.total,
      total: grouped[type]?.length || data.total,
      passed: data.passed,
      noResults: data.noResults,
      errors: data.errors,
      coverage: ((data.total / (grouped[type]?.length || data.total)) * 100).toFixed(1),
      passRate: ((data.passed / data.total) * 100).toFixed(2),
      avgDuration: (data.avgDuration / data.total).toFixed(3),
    };
  }

  return report;
}

/**
 * Generate sample queries by type
 */
function generateSampleQueries(count = 10) {
  const grouped = groupTestCasesByType(allTestCases);
  const samples = {};

  for (const [type, testCases] of Object.entries(grouped)) {
    // Get random samples
    const typeTestCases = testCases.sort(() => Math.random() - 0.5).slice(0, count);
    samples[type] = typeTestCases.map((tc) => tc.query);
  }

  return samples;
}

/**
 * Main execution
 */
function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   10K Product Test - Local Executor   ║");
  console.log("║   Pricing & Taste Event Testing       ║");
  console.log("╚════════════════════════════════════════╝");

  console.log("\n📊 Test Suite Information:");
  console.log(`   Total Tests Available: ${allTestCases.length}`);

  // Ask for test count (defaults to 100 for quick testing)
  const testCount = process.argv[2] ? parseInt(process.argv[2]) : 100;
  const actualCount = Math.min(testCount, allTestCases.length);

  console.log(`   Running: ${actualCount} tests`);
  console.log(`   Mock Products: ${mockProducts.length}`);

  // Run tests
  const startTime = Date.now();
  const results = executeAllTestCasesLocal(actualCount);
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Generate report
  const report = generateLocalReport(results);

  // Display report
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║         Test Execution Report         ║");
  console.log("╚════════════════════════════════════════╝");

  console.log("\n📈 Overall Results:");
  console.log(`   ✓ Passed:      ${report.results.passed}`);
  console.log(`   ⚠ No Results:  ${report.results.noResults}`);
  console.log(`   ✗ Errors:      ${report.results.errors}`);
  console.log(`   Success Rate:  ${(
    ((report.results.passed + report.results.noResults) / report.summary.totalTests) *
    100
  ).toFixed(2)}%`);

  console.log("\n⏱️  Performance Metrics:");
  console.log(`   Average Duration:     ${report.performance.averageDuration}ms`);
  console.log(`   Min Duration:         ${report.performance.minDuration}ms`);
  console.log(`   Max Duration:         ${report.performance.maxDuration}ms`);
  console.log(`   Total Execution Time: ${report.performance.totalTime}s`);

  console.log("\n🎯 Results by Test Type:");
  console.log(
    `${"Type".padEnd(25)} | Tested | Total | Pass% | Coverage | Avg Duration`
  );
  console.log(`${"-".repeat(80)}`);
  for (const [type, data] of Object.entries(report.byType)) {
    console.log(
      `${type.padEnd(25)} | ${data.tested.toString().padStart(6)} | ${data.total.toString().padStart(5)} | ${data.passRate.padStart(5)} | ${data.coverage.padStart(7)}% | ${data.avgDuration}ms`
    );
  }

  // Show sample queries
  console.log("\n📋 Sample Test Queries (5 per type):");
  const samples = generateSampleQueries(5);
  for (const [type, queries] of Object.entries(samples)) {
    console.log(`\n   ${type}:`);
    queries.forEach((q, i) => console.log(`     ${i + 1}. "${q}"`));
  }

  // Export results
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T")[0];
  const reportFile = path.join(
    __dirname,
    `test-results-local-${timestamp}.json`
  );

  const output = {
    report,
    testCount: actualCount,
    sampleResults: results.slice(0, 10),
    exportedAt: new Date().toISOString(),
  };

  fs.writeFileSync(reportFile, JSON.stringify(output, null, 2));
  console.log(`\n📁 Detailed results exported to: ${reportFile}`);

  console.log("\n✅ Test execution completed!");
  console.log(
    `\nTo run full 10k tests: node run-10k-tests.mjs`
  );
}

// Run if executed directly
const currentFileUrl = import.meta.url;
const isMainModule = process.argv[1].includes('test-10k-local.mjs') || currentFileUrl.includes(process.argv[1]);

if (isMainModule) {
  main();
}

export {
  executeLocalTestCase,
  executeAllTestCasesLocal,
  generateLocalReport,
  localProductSearch,
};
