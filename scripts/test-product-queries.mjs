const testCases = [
  "show me nachos deals",
  "details of the nachos deals",
  "best selling snack",
  "best seller in your store",
  "popular snacks",
  "top deals",
  "show me bundles",
  "movie night snacks",
  "best for movie",
  "price of nachos",
  "share products rate",
  "what snacks do you have",
  "show me store snacks",
  "best combo",
  "family pack snacks",
  "deals for parties",
  "show nachos bundle",
  "what is the price of paprika nachos",
  "give me chips options",
  "show all snacks",
  "best featured products",
  "what are your top products",
  "need snack bundle",
  "recommend snacks for guests",
  "snack box options",
  "best chips for movie night",
  "show me banana chips",
  "show multi grain snacks",
  "what deal do you have",
  "combo offer please",
  "store catalog",
  "show me your product catalog",
  "popular nachos",
  "best nachos",
  "deal on wafers",
  "price of wafer bundle",
  "chocolate deal",
  "show all combos",
  "bundle for office snacks",
  "fun snack bundle",
  "ultimate snack deal",
  "fiesta deal",
  "flavor fiesta bundle",
  "which snack is popular",
  "featured bundle",
  "best for sharing",
  "what is in stock",
  "store deals",
  "bundle options",
  "nachos pack rate",
  "show me deals in the store",
  "what are your best deals",
  "what can i buy for movie time",
  "recommend me a combo",
  "which bundle is good",
  "chips price list",
  "share all chips rate",
  "snakitos nachos",
  "salsa nachos",
  "paprika nachos",
  "store snacks for kids",
  "best snacks for office",
  "mega snack deal",
  "much snack deal",
  "snack sampler",
  "deal free shipping",
  "snakitos prices",
  "best item of your store",
  "which is best selling",
  "best selling deal",
  "top bundles",
  "show me featured snacks",
  "can you share snack prices",
  "what snacks are available",
  "available deals",
  "popular chips",
  "nachos collection",
  "deals collection",
  "bundle collection",
  "movie night combo",
  "party snack box",
  "family sharing pack",
  "snack recommendations",
  "best rated snacks",
  "show products with prices",
  "what should i order for a party",
  "good snack for family movie night",
  "nachos for movie",
  "what are the combo prices",
  "deal bundles please",
  "snack store products",
  "store best picks",
  "what is your popular bundle",
  "show me crunchy snacks",
  "snack offers",
  "top snack offers",
  "best featured nachos",
  "what are your store specials",
  "show me your deals and bundles",
  "best snakitos snack",
  "recommend your best selling chips",
  "which snacks are best for movie and sharing",
  "product prices please",
];

function extractProductQuery(message) {
  return message
    .toLowerCase()
    .replace(
      /\b(hey|hi|hello|please|okay|ok|i want|i need|show me|give me|tell me|details|detail|about|of the|from the|in the|for the|what is|what are|do you have|can you|could you|share|know|information|info|available|availability|stock)\b/gi,
      " ",
    )
    .replace(/[^a-z0-9\s&-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PRODUCT_KEYWORDS = [
  "product",
  "products",
  "price",
  "available",
  "availability",
  "stock",
  "ingredient",
  "flavor",
  "size",
  "buy",
  "snack",
  "snacks",
  "deal",
  "deals",
  "combo",
  "combos",
  "nachos",
  "chips",
  "bundle",
  "seller",
  "selling",
  "movie",
  "store",
  "catalog",
  "sharing",
  "party",
  "pack",
  "specials",
  "item",
  "items",
];

const PRODUCT_BROWSING_PATTERNS = [
  /best\s+seller/i,
  /best\s+selling/i,
  /best\s+for\s+movie/i,
  /best\s+for\s+sharing/i,
  /store\s+catalog/i,
  /store\s+specials/i,
  /store\s+best/i,
  /party/i,
  /movie/i,
  /sharing/i,
];

function detectIntent(message) {
  const normalizedMessage = message.toLowerCase();
  if (
    PRODUCT_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword)) ||
    PRODUCT_BROWSING_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return "product";
  }
  return "general";
}

const results = testCases.map((message) => ({
  message,
  intent: detectIntent(message),
  query: extractProductQuery(message),
}));

const failures = results.filter((item) => item.intent !== "product" || !item.query);

console.log(`Ran ${results.length} product query tests.`);
console.log(`Passed: ${results.length - failures.length}`);
console.log(`Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
