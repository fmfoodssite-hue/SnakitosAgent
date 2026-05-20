import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const defaultSuitePath = path.join(root, ".local", "snakitos_rag_full_test_suite.json");
const packDir = path.join(root, "apps", "chatbot", "src", "server", "data", "snakitos-rag-pack");
const trainingOutPath = path.join(packDir, "19-eval-suite-training-dataset.json");
const conflictsOutPath = path.join(packDir, "20-eval-suite-conflicts.json");

function normalizeMessage(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function detectLanguage(message) {
  const normalized = normalizeMessage(message);
  const romanUrduHints = [
    "bhai",
    "batao",
    "kya",
    "hai",
    "hain",
    "mujhe",
    "mera",
    "kitne",
    "kitny",
    "andar",
    "liye",
    "wapis",
    "karna",
    "chahiye",
  ].filter((token) => normalized.includes(token)).length;
  const englishHints = [
    "order",
    "refund",
    "delivery",
    "shipping",
    "snack",
    "bundle",
    "discount",
    "payment",
  ].filter((token) => normalized.includes(token)).length;

  if (romanUrduHints > 0 && englishHints > 0) {
    return "mixed";
  }

  return romanUrduHints > 0 ? "roman_urdu" : "english";
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferRecommendedProducts(message) {
  const normalized = normalizeMessage(message);

  if (/(spicy|teekha|bohat teekha)/.test(normalized)) {
    return ["Stix Hot & Spicy", "Stix Peri Peri", "Nachos Salsa"];
  }
  if (/(sweet|meetha|choco|wafer)/.test(normalized)) {
    return ["Choco Stick Chocolate", "Wafer Rolls Hazelnut", "Choco Lovers Bundle"];
  }
  if (/(office|team|work)/.test(normalized)) {
    return ["Office Snack Box", "All Time Favorites"];
  }
  if (/(movie|netflix|gaming|cricket match)/.test(normalized)) {
    return ["Movie Night Nachos Bundle", "Stix Party"];
  }
  if (/(kids|school lunch)/.test(normalized)) {
    return ["Kids Fun Box", "Choco Stick Strawberry"];
  }
  if (/(gift|birthday|party|family)/.test(normalized)) {
    return ["Ultimate Mega Snack Box", "Flavor Fiesta Bundle"];
  }
  if (/(bundle|deal|discount|cheap|sasti|under \d+|andar)/.test(normalized)) {
    return ["Snack Sampler Deal", "All Time Favorites"];
  }
  if (/(banana|chips)/.test(normalized)) {
    return ["Banana Chips Sea Salt", "Banana Chips Achari Masti"];
  }
  if (/stix/.test(normalized)) {
    return ["Stix Hot & Spicy", "Stix Salty"];
  }
  if (/nachos/.test(normalized)) {
    return ["Nachos Salsa", "Nachos Paprika"];
  }

  return [];
}

function buildIdealAnswer(row) {
  const message = normalizeMessage(row.User_Message);
  const intent = row.Expected_Intent;
  const action = row.Expected_Action;
  const language = detectLanguage(row.User_Message);
  const roman = language === "roman_urdu" || language === "mixed";

  if (intent === "order_status") {
    return roman
      ? "Zaroor. Apna order number ya checkout wala phone number share kar dein taake support aapka order status check kar sake."
      : "Sure. Please share your order number or the phone number used at checkout so support can check your order status.";
  }

  if (intent === "recommendation") {
    if (/(spicy|teekha)/.test(message)) {
      return roman
        ? "Agar aapko spicy snacks pasand hain to Stix Hot & Spicy, Stix Peri Peri, Nachos Salsa, aur Banana Chips Achari Masti strong options hain."
        : "If you enjoy spicy snacks, strong options include Stix Hot & Spicy, Stix Peri Peri, Nachos Salsa, and Banana Chips Achari Masti.";
    }
    if (/(sweet|meetha)/.test(message)) {
      return roman
        ? "Meetha craving ke liye Choco Stick, Wafer Rolls, aur Coco Choco Can achay options hain."
        : "For sweet cravings, Choco Stick, Wafer Rolls, and Coco Choco Can are good options.";
    }
    return roman
      ? "Main aapko taste, budget, ya occasion ke hisaab se best snacks suggest kar sakta hoon."
      : "I can suggest the best snacks based on taste, budget, or occasion.";
  }

  if (intent === "product_query") {
    return roman
      ? "Yeh product ya category available options mein se check karke best matching snack dikhani chahiye."
      : "This should retrieve the matching product or collection details directly.";
  }

  if (intent === "complaint") {
    return roman
      ? "Mujhe afsos hai. Please order number aur issue details share kar dein taake support is complaint ko properly handle kar sake."
      : "I’m sorry about that. Please share your order number and issue details so support can handle this complaint properly.";
  }

  if (intent === "store_policy_or_complaint") {
    return roman
      ? "Food items ke return, refund, ya replacement cases mein policy carefully explain karni chahiye aur zarurat par support ko escalate karna chahiye."
      : "For return, refund, or replacement cases, explain the policy carefully and escalate to support when needed.";
  }

  if (intent === "store_policy_or_product_detail") {
    return roman
      ? "Ingredients, allergens, halal, ya certification ke liye sirf safe confirmed guidance deni chahiye aur exact confirmation support ya packaging se leni chahiye."
      : "For ingredients, allergens, halal, or certification, provide only safe confirmed guidance and direct exact confirmation to support or packaging.";
  }

  if (intent === "wholesale") {
    return roman
      ? "Wholesale ya corporate query mein quantity, city, aur business details mang kar support handoff karna chahiye."
      : "For wholesale or corporate queries, ask for quantity, city, and business details, then hand off to support.";
  }

  if (intent === "mixed" || intent === "mixed_by_trigger") {
    return roman
      ? "Is short ya mixed prompt ko expand karke sahi policy, support, ya product path par le jana chahiye."
      : "This short or mixed prompt should be expanded first, then routed to the correct policy, support, or product path.";
  }

  if (/what do you sell|shop online hai|pakistani snacks|about|contact|number|address/.test(message)) {
    return roman
      ? "Snakitos FM Foods ka brand hai jahan Pakistani snacks, bundles, aur snack boxes milte hain."
      : "Snakitos is a brand by FM Foods offering Pakistani snacks, bundles, and snack boxes.";
  }

  if (action === "retrieve_or_fallback") {
    return roman
      ? "Safe policy guidance dein aur agar exact detail confirm na ho to customer ko checkout ya support par guide karein."
      : "Provide safe policy guidance, and if exact details are not confirmed, guide the customer to checkout or support.";
  }

  return roman
    ? "Customer ki query ka clear, safe, aur helpful jawab dein aur zarurat par support ko escalate karein."
    : "Provide a clear, safe, and helpful answer, and escalate to support when needed.";
}

function buildFollowUpQuestion(row) {
  const message = normalizeMessage(row.User_Message);
  const intent = row.Expected_Intent;
  const language = detectLanguage(row.User_Message);
  const roman = language === "roman_urdu" || language === "mixed";

  if (intent === "order_status") {
    return roman
      ? "Kya aap order number share kar sakte hain, ya checkout wala phone number?"
      : "Can you share the order number, or the phone number used at checkout?";
  }

  if (intent === "recommendation") {
    if (/\b\d{3,5}\b|under|andar/.test(message)) {
      return roman ? "Aap spicy, sweet, ya mixed lena chahenge?" : "Would you like spicy, sweet, or mixed snacks?";
    }
    return roman
      ? "Aap spicy, sweet, salty, crunchy, ya mixed kya lena chahenge?"
      : "Would you like spicy, sweet, salty, crunchy, or mixed snacks?";
  }

  if (intent === "wholesale") {
    return roman
      ? "Quantity, city, aur business name share kar dein?"
      : "Could you share the quantity, city, and business name?";
  }

  if (intent === "store_policy_or_product_detail") {
    return roman
      ? "Agar exact product batayen to main zyada targeted guidance de sakta hoon."
      : "If you share the exact product, I can give more targeted guidance.";
  }

  return "";
}

function toTrainingItem(row) {
  const language = detectLanguage(row.User_Message);
  const tags = unique([
    `category:${slugify(row.Category)}`,
    `intent:${slugify(row.Expected_Intent)}`,
    `collection:${slugify(row.Expected_Collection)}`,
    `action:${slugify(row.Expected_Action)}`,
    row.Expected_Answer_Type ? `answer:${slugify(row.Expected_Answer_Type)}` : "",
  ]);

  return {
    id: `suite-${String(row.ID).padStart(3, "0")}`,
    intent: row.Expected_Intent,
    language,
    user_query: row.User_Message,
    ideal_answer: buildIdealAnswer(row),
    recommended_products: inferRecommendedProducts(row.User_Message),
    follow_up_question: buildFollowUpQuestion(row),
    tags,
    requires_escalation: normalizeMessage(row.Should_Escalate) === "yes",
  };
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultSuitePath;
  const raw = await fs.readFile(inputPath, "utf8");
  const rows = JSON.parse(raw);

  const grouped = new Map();
  for (const row of rows) {
    const key = normalizeMessage(row.User_Message);
    const signature = [
      row.Expected_Intent,
      row.Expected_Collection,
      row.Expected_Action,
      normalizeMessage(row.Should_Escalate),
    ].join("|");
    const existing = grouped.get(key) ?? { rows: [], signatures: new Set() };
    existing.rows.push(row);
    existing.signatures.add(signature);
    grouped.set(key, existing);
  }

  const conflicts = [];
  const trainingRows = [];

  for (const [message, entry] of grouped.entries()) {
    if (entry.signatures.size > 1) {
      conflicts.push({
        user_message: message,
        rows: entry.rows.map((row) => ({
          id: row.ID,
          category: row.Category,
          expected_intent: row.Expected_Intent,
          expected_collection: row.Expected_Collection,
          expected_action: row.Expected_Action,
          should_escalate: row.Should_Escalate,
        })),
      });
      continue;
    }

    trainingRows.push(entry.rows[0]);
  }

  const dataset = trainingRows.map(toTrainingItem);

  await fs.mkdir(packDir, { recursive: true });
  await fs.writeFile(trainingOutPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await fs.writeFile(conflictsOutPath, `${JSON.stringify(conflicts, null, 2)}\n`, "utf8");

  console.log(
    `Built ${dataset.length} clean training items from ${rows.length} suite rows. Conflicts: ${conflicts.length}.`,
  );
  console.log(`Training dataset: ${trainingOutPath}`);
  console.log(`Conflict report: ${conflictsOutPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
