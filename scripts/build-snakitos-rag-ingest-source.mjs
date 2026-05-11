import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const packDir = path.join(root, "apps", "chatbot", "src", "server", "data", "snakitos-rag-pack");
const outPath = path.join(root, "scripts", "generated-snakitos-rag-ingest.json");

async function loadJson(name) {
  const raw = await fs.readFile(path.join(packDir, name), "utf8");
  return JSON.parse(raw);
}

function toId(prefix, index) {
  return `${prefix}-${String(index + 1).padStart(4, "0")}`;
}

function toKnowledgeItems({ generalTraining, faqs, recommendations, productRecords }) {
  return [
    ...generalTraining.map((item, index) => ({
      id: item.id || toId("training", index),
      name: `Training: ${item.intent || "general"}`,
      description: [item.user_query, item.ideal_answer, item.follow_up_question]
        .filter(Boolean)
        .join(" "),
      type: "knowledge",
      category: `training_${item.intent || "general"}`,
      link: "https://snakitos.com",
    })),
    ...faqs.map((item, index) => ({
      id: toId("faq", index),
      name: item.question || "Snakitos FAQ",
      description: [
        `Category: ${item.category || "general"}.`,
        item.answer || "",
        item.safe_upsell ? `Safe upsell: ${item.safe_upsell}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      type: "faq",
      category: (item.category || "general").toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      link: "https://snakitos.com",
    })),
    ...recommendations.map((item, index) => ({
      id: item.id || toId("recommendation", index),
      name: `Recommendation: ${item.trigger_type || "general"} ${item.trigger_value || ""}`.trim(),
      description: [
        `Trigger type ${item.trigger_type || "general"}.`,
        `Trigger value ${item.trigger_value || "general"}.`,
        Array.isArray(item.primary_recommendations)
          ? `Primary recommendations: ${item.primary_recommendations.join(", ")}.`
          : "",
        Array.isArray(item.bundle_priority)
          ? `Bundle priority: ${item.bundle_priority.join(", ")}.`
          : "",
        item.balancing_add_on ? `Balancing add-on: ${item.balancing_add_on}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      type: "intent",
      category: `recommendation_${item.trigger_type || "general"}`,
      link: "https://snakitos.com/collections/all",
    })),
    ...productRecords.map((item, index) => ({
      id: toId("product-record", index),
      name: item.product_name || "Snakitos Product Record",
      description: [
        `${item.product_name || "This product"} is a ${item.flavor_type || "snack"} ${item.category || "product"}.`,
        Array.isArray(item.taste_tags) ? `Taste tags: ${item.taste_tags.join(", ")}.` : "",
        Array.isArray(item.occasion_tags) ? `Occasion tags: ${item.occasion_tags.join(", ")}.` : "",
        item.bundle_upgrade ? `Bundle upgrade: ${item.bundle_upgrade}.` : "",
        Array.isArray(item.cross_sell_products)
          ? `Cross-sell: ${item.cross_sell_products.join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      type: "product",
      category: (item.category || "general").toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      link: item.product_url || "https://snakitos.com/collections/all",
    })),
  ];
}

async function main() {
  const [generalTraining, faqs, recommendations, productRecords] = await Promise.all([
    loadJson("01-general-query-training-dataset.json"),
    loadJson("02-product-faq-dataset.json"),
    loadJson("03-product-recommendation-dataset.json"),
    loadJson("15-product-records.json"),
  ]);

  const items = toKnowledgeItems({
    generalTraining,
    faqs,
    recommendations,
    productRecords,
  });

  await fs.writeFile(outPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  console.log(`Generated ${items.length} ingest records at ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
