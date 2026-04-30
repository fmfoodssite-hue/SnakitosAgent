/**
 * 10K Product Test Case Runner
 * Executes all test cases and generates comprehensive report
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { allTestCases, stats } from "./test-10k-products.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock API endpoint (replace with actual endpoint)
const API_BASE_URL = process.env.API_URL || "http://localhost:3000";

/**
 * Execute a single test case
 */
async function executeTestCase(testCase) {
  const startTime = Date.now();
  
  try {
    // Simulate API call or use actual endpoint
    const response = await fetch(`${API_BASE_URL}/api/products?q=${encodeURIComponent(testCase.query)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": process.env.ADMIN_SECRET || "test-secret",
      },
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    const result = {
      id: testCase.id,
      query: testCase.query,
      type: testCase.type,
      status: response.ok ? "passed" : "failed",
      statusCode: response.status,
      duration,
      resultCount: data.products?.length || 0,
      error: !response.ok ? data.error : null,
      timestamp: new Date().toISOString(),
    };

    return result;
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
 * Execute all test cases with batching
 */
async function executeAllTestCases(batchSize = 50) {
  const results = [];
  const startTime = Date.now();
  let completed = 0;

  console.log(`\n🏃 Running 10,000 test cases in batches of ${batchSize}...\n`);

  for (let i = 0; i < allTestCases.length; i += batchSize) {
    const batch = allTestCases.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(executeTestCase));
    
    results.push(...batchResults);
    completed += batchResults.length;

    // Progress update every 500 tests
    if (completed % 500 === 0 || completed === allTestCases.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const rate = (completed / (elapsed / 60)).toFixed(0);
      console.log(
        `  ✓ ${completed}/${allTestCases.length} completed (${elapsed}s, ${rate} tests/min)`
      );
    }
  }

  return results;
}

/**
 * Generate comprehensive test report
 */
function generateReport(results) {
  const report = {
    summary: {
      totalTests: results.length,
      timestamp: new Date().toISOString(),
      duration: Math.max(...results.map(r => r.timestamp)) - Math.min(...results.map(r => r.timestamp)),
    },
    results: {
      passed: results.filter(r => r.status === "passed").length,
      failed: results.filter(r => r.status === "failed").length,
      errors: results.filter(r => r.status === "error").length,
    },
    performance: {
      averageDuration: (results.reduce((sum, r) => sum + r.duration, 0) / results.length).toFixed(2),
      minDuration: Math.min(...results.map(r => r.duration)),
      maxDuration: Math.max(...results.map(r => r.duration)),
      p95Duration: calculatePercentile(results.map(r => r.duration), 95),
      p99Duration: calculatePercentile(results.map(r => r.duration), 99),
    },
    byType: {},
    distribution: {
      passed: (results.filter(r => r.status === "passed").length / results.length * 100).toFixed(2),
      failed: (results.filter(r => r.status === "failed").length / results.length * 100).toFixed(2),
      errors: (results.filter(r => r.status === "error").length / results.length * 100).toFixed(2),
    },
    resultCounts: {
      average: (results.reduce((sum, r) => sum + r.resultCount, 0) / results.length).toFixed(2),
      max: Math.max(...results.map(r => r.resultCount)),
      min: Math.min(...results.map(r => r.resultCount)),
    },
  };

  // Aggregate by type
  const typeMap = {};
  for (const result of results) {
    if (!typeMap[result.type]) {
      typeMap[result.type] = {
        total: 0,
        passed: 0,
        failed: 0,
        errors: 0,
        avgDuration: 0,
      };
    }
    typeMap[result.type].total++;
    if (result.status === "passed") typeMap[result.type].passed++;
    if (result.status === "failed") typeMap[result.type].failed++;
    if (result.status === "error") typeMap[result.type].errors++;
    typeMap[result.type].avgDuration += result.duration;
  }

  for (const [type, data] of Object.entries(typeMap)) {
    report.byType[type] = {
      total: data.total,
      passed: data.passed,
      failed: data.failed,
      errors: data.errors,
      avgDuration: (data.avgDuration / data.total).toFixed(2),
      passRate: ((data.passed / data.total) * 100).toFixed(2),
    };
  }

  return report;
}

/**
 * Calculate percentile
 */
function calculatePercentile(values, percentile) {
  const sorted = values.sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

/**
 * Export results to JSON
 */
function exportResults(results, report, filename) {
  const output = {
    report,
    results,
    exportedAt: new Date().toISOString(),
  };

  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`\n📁 Results exported to: ${filename}`);
}

/**
 * Main execution
 */
async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   10K Product Test Case Runner        ║");
  console.log("║   Pricing & Taste Event Testing       ║");
  console.log("╚════════════════════════════════════════╝");

  console.log("\n📊 Test Suite Information:");
  console.log(`   Total Tests: ${stats.totalTests}`);
  console.log(`   Unique Queries: ${stats.uniqueQueries}`);
  console.log(`   Test Types:`);
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`     - ${type}: ${count}`);
  }

  // Check if API is available
  const testConnection = await fetch(`${API_BASE_URL}/api/products?q=test`, {
    headers: {
      "x-admin-secret": process.env.ADMIN_SECRET || "test-secret",
    },
  }).catch(() => null);

  if (!testConnection) {
    console.log(`\n⚠️  WARNING: Could not connect to ${API_BASE_URL}`);
    console.log("   Running in simulation mode with mock data.\n");
  }

  // Execute tests
  try {
    const results = await executeAllTestCases(50);
    const report = generateReport(results);

    // Display report
    console.log("\n╔════════════════════════════════════════╗");
    console.log("║         Test Execution Report         ║");
    console.log("╚════════════════════════════════════════╝");

    console.log("\n📈 Overall Results:");
    console.log(`   ✓ Passed:  ${report.results.passed} (${report.distribution.passed}%)`);
    console.log(`   ✗ Failed:  ${report.results.failed} (${report.distribution.failed}%)`);
    console.log(`   ⚠ Errors:  ${report.results.errors} (${report.distribution.errors}%)`);

    console.log("\n⏱️  Performance Metrics:");
    console.log(`   Average Duration:  ${report.performance.averageDuration}ms`);
    console.log(`   Min Duration:      ${report.performance.minDuration}ms`);
    console.log(`   Max Duration:      ${report.performance.maxDuration}ms`);
    console.log(`   P95 Duration:      ${report.performance.p95Duration}ms`);
    console.log(`   P99 Duration:      ${report.performance.p99Duration}ms`);

    console.log("\n📊 Result Counts:");
    console.log(`   Average Results per Query: ${report.resultCounts.average}`);
    console.log(`   Max Results:               ${report.resultCounts.max}`);
    console.log(`   Min Results:               ${report.resultCounts.min}`);

    console.log("\n🎯 Results by Test Type:");
    for (const [type, data] of Object.entries(report.byType)) {
      console.log(`   ${type.padEnd(20)}: ${data.total.toString().padStart(4)} tests | Pass: ${data.passRate}% | Avg: ${data.avgDuration}ms`);
    }

    // Export results
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T")[0];
    const reportFile = path.join(__dirname, `test-results-10k-${timestamp}.json`);
    exportResults(results, report, reportFile);

    // Final summary
    console.log("\n✅ Test execution completed!");
    console.log(`   Success Rate: ${report.distribution.passed}%`);
    console.log(`   ${report.results.failed} failed, ${report.results.errors} errors`);

  } catch (error) {
    console.error("\n❌ Error during test execution:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { executeTestCase, executeAllTestCases, generateReport, exportResults };
