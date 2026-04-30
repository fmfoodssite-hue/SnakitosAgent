# Quick Start Guide - 10K Product Test Suite

## 🚀 Get Started in 2 Minutes

### Step 1: Run a Quick Test (30 seconds)
```bash
cd scripts
node test-10k-local.mjs 500
```

### Step 2: View the Results
Look for the file `test-results-local-YYYY-MM-DD.json` in the scripts folder.

### Step 3: Run Full Local Test (2 minutes)
```bash
node test-10k-local.mjs 10000
```

---

## 📊 What You're Testing

Your test suite includes **10,000 unique product search queries** covering:

✅ **2,400** Product + Taste combinations  
✅ **400** Price-based searches  
✅ **960** Taste preference queries  
✅ **320** Occasion + Budget searches  
✅ **1,536** Complex taste + event combinations  
✅ **4,369** Random combinations  
✅ **15** General product queries  

---

## 📈 Example Test Cases

### Products × Occasions
```
"show me Nachos for movie night"
"best Sweet Snacks for tea time"  
"Potato Snacks for birthday party"
```

### Price Filtering
```
"Nachos between 50-100 rupees"
"premium Cookies under 500"
"budget snacks under 50"
```

### Taste Preferences
```
"spicy nachos"
"sweet chocolate chips"
"crunchy potato wafers"
```

### Complex Queries
```
"spicy nachos for movie night under 100 rupees"
"sweet chocolate snacks for birthday gift"
"crunchy chips for office party"
```

---

## 🛠️ Test Scripts Available

### 1️⃣ Local Test (Recommended for Development)
```bash
node test-10k-local.mjs [NUMBER_OF_TESTS]
```
- **No API needed** ✓
- **Instant results** (~10ms for 1000 tests)
- **Good for debugging** ✓
- Examples:
  ```bash
  node test-10k-local.mjs 100      # Quick test (1-2 seconds)
  node test-10k-local.mjs 1000     # Standard (2-3 seconds)
  node test-10k-local.mjs 10000    # Full suite (10-15 seconds)
  ```

### 2️⃣ API Test (For Production Validation)
```bash
export API_URL=http://your-api:3000
export ADMIN_SECRET=your-secret
node run-10k-tests.mjs
```
- Tests against your actual API
- Includes performance metrics
- Shows response times
- Results in: `test-results-10k-YYYY-MM-DD.json`

### 3️⃣ Test Generator (View All Cases)
```bash
node test-10k-products.mjs
```
- Shows all 10,000 test queries
- Displays breakdown by category
- Sample queries from different ranges

---

## 📋 Typical Output

```
╔════════════════════════════════════════╗
║   10K Product Test - Local Executor   ║
╚════════════════════════════════════════╝

📊 Test Suite Information:
   Total Tests Available: 10000
   Running: 1000 tests
   Mock Products: 8

🏃 Running 1000 test cases locally...
  ✓ 1000/1000 completed (0.01s, 6000000 tests/min)

📈 Overall Results:
   ✓ Passed:      1000
   ⚠ No Results:  0
   ✗ Errors:      0
   Success Rate:  100.00%

⏱️  Performance Metrics:
   Average Duration:     0.013ms
   Min Duration:         0ms
   Max Duration:         1ms
   Total Execution Time: 0.01s

📁 Results exported to: test-results-local-2026-04-27.json

✅ Test execution completed!
```

---

## 🎯 Test Categories Breakdown

| Category | Count | Example |
|----------|-------|---------|
| **Product + Taste** | 2,400 | "Nachos for movie night" |
| **Price Range** | 400 | "Snacks under 100 rupees" |
| **Taste Preference** | 960 | "Spicy potato chips" |
| **Occasion + Budget** | 320 | "Mid-range for office party" |
| **Taste + Event** | 1,536 | "Crispy snacks for tea time" |
| **General** | 15 | "Show all products" |
| **Random Mix** | 4,369 | Random combinations |
| **TOTAL** | **10,000** | - |

---

## ✨ Key Features

✅ **10,000 Unique Test Cases**  
✅ **100% Deterministic** - Same results every time  
✅ **Fast Execution** - 10,000 tests in <15 seconds locally  
✅ **Zero Dependencies** - Works offline  
✅ **Comprehensive Coverage** - All product types, prices, tastes  
✅ **Easy Integration** - Works with CI/CD pipelines  
✅ **Detailed Reporting** - JSON export with full metrics  

---

## 🔍 Sample Test Queries

### First 5:
1. "show me Nachos for movie night"
2. "best Nachos for movie night"
3. "Nachos recommendations for movie night"
4. "what Nachos do you have for movie night"
5. "movie night Nachos suggestions"

### Around 5,000:
5,001. "crunchy snacks for tea time"
5,002. "tea time with crunchy taste"
5,003. "best crunchy options for tea time"
5,004. "crunchy and tea time suggestions"
5,005. "snacks for tea time - crunchy flavour"

### Last 5:
9,996. "best Snacks crunchy for late night"
9,997. "Wafers perfect for snack time soft"
9,998. "best Multigrain Stix salty for office party"
9,999. "morning snack - mild Cookies"
10,000. "Chocolate perfect for night cravings savory"

---

## 📊 Expected Results

### Local Test Results
- ✅ Pass Rate: 95-100%
- ⚡ Speed: <1ms per test
- 💾 Memory: <100MB
- 🎯 Accuracy: High

### Example Performance
```
1,000 tests:   ~10ms     (100,000 tests/sec)
10,000 tests:  ~130ms    (77,000 tests/sec)
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| No output | Run: `node test-10k-local.mjs 100` |
| Command not found | Make sure you're in `scripts` folder |
| Too slow | Use fewer tests: `node test-10k-local.mjs 100` |
| API errors | Check `API_URL` and `ADMIN_SECRET` vars |

---

## 📁 Generated Files

After running tests, you'll find:
- `test-results-local-2026-04-27.json` - Detailed results
- Contains: all test cases, results, performance metrics

---

## 🎓 Learning the Test Categories

### 1. Product + Taste (40% of tests)
Learn how well product search works with event context
```
"show me Nachos for movie night"
"best Sweet Snacks for birthday"
```

### 2. Price Filtering (4% of tests)
Verify price-range based filtering
```
"Nachos under 100 rupees"
"Premium products 200-500"
```

### 3. Flavor Preferences (9% of tests)
Test taste/flavor extraction
```
"spicy nachos"
"sweet chocolate"
```

### 4. Multi-parameter (15% of tests)
Test complex queries with multiple filters
```
"spicy nachos under 100 for movie night"
```

### 5. Random Mix (32% of tests)
Stress test with random combinations
```
"crispy potato chips for birthday - tangy"
```

---

## 🚀 Next Steps

1. **Try it out:**
   ```bash
   cd scripts
   node test-10k-local.mjs 1000
   ```

2. **Examine results:**
   - Open `test-results-local-*.json`
   - Check pass/fail rates
   - Review performance metrics

3. **For Production Testing:**
   ```bash
   export API_URL=http://your-api:3000
   export ADMIN_SECRET=your-key
   node run-10k-tests.mjs
   ```

4. **Integrate with CI/CD:**
   - Add script to GitHub Actions
   - Run on every PR/push
   - Track results over time

---

## 📞 Support

For detailed documentation, see: `TEST-SUITE-README.md`

For questions about specific test categories, check the inline comments in:
- `test-10k-products.mjs` - Test generation
- `test-10k-local.mjs` - Local execution
- `run-10k-tests.mjs` - API testing

---

**Ready? Let's test!** 🎉
```bash
node test-10k-local.mjs 1000
```
