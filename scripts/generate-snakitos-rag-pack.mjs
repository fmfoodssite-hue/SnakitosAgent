import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "apps", "chatbot", "src", "server", "data", "snakitos-rag-pack");

const openingMessage =
  "Hi! I'm the Snakitos AI Assistant. I can help you find snack deals, recommend snacks by taste or budget, and answer questions about products, delivery, payments, and refunds. What are you craving today - spicy, sweet, crunchy, or a mixed snack box?";

const productRecords = [
  {
    product_name: "Stix Hot & Spicy",
    category: "Multigrain Stix",
    price: "225",
    size: "50g",
    flavor_type: "spicy",
    taste_tags: ["spicy", "masala", "crunchy", "savory"],
    occasion_tags: ["movie night", "gaming", "netflix", "office"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["spicy_caution", "savory_snack"],
    kids_friendly: "no",
    spice_level: "high",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Stix Bundle", "Multi Grain Stix - Can Tray 5 +1"],
    cross_sell_products: ["Stix Peri Peri", "Nachos Salsa", "Choco Stick Chocolate"],
    bundle_upgrade: "Flavor Fiesta Bundle",
    frequently_bought_with: ["Choco Stick Chocolate", "Nachos Salsa"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Stix Peri Peri",
    category: "Multigrain Stix",
    price: "217.43",
    size: "50g",
    flavor_type: "spicy",
    taste_tags: ["spicy", "tangy", "masala", "crunchy", "savory"],
    occasion_tags: ["movie night", "gaming", "office", "travel"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["spicy_caution", "savory_snack"],
    kids_friendly: "no",
    spice_level: "medium_high",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Stix Bundle", "Multi Grain Stix - Can Tray 5 +1"],
    cross_sell_products: ["Stix Lemon & Chilli", "Patata Masala"],
    bundle_upgrade: "Flavor Fiesta Bundle",
    frequently_bought_with: ["Patata Masala", "Wafer Rolls Hazelnut"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Stix Lemon & Chilli",
    category: "Multigrain Stix",
    price: "210.36",
    size: "50g",
    flavor_type: "spicy",
    taste_tags: ["spicy", "tangy", "crunchy", "savory"],
    occasion_tags: ["movie night", "travel", "office"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["spicy_caution", "savory_snack"],
    kids_friendly: "no",
    spice_level: "medium",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Stix Bundle"],
    cross_sell_products: ["Stix Peri Peri", "Nachos Salsa"],
    bundle_upgrade: "Flavor Fiesta Bundle",
    frequently_bought_with: ["Patata Salty"],
    best_seller: false,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Stix Salty",
    category: "Multigrain Stix",
    price: "214.90",
    size: "50g",
    flavor_type: "mild_salty",
    taste_tags: ["mild", "salty", "crunchy", "savory"],
    occasion_tags: ["office", "tea time", "school lunch", "travel"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["kids_friendly", "savory_snack"],
    kids_friendly: "yes",
    spice_level: "low",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Multi Grain Stix - Can Tray 5 +1"],
    cross_sell_products: ["ChickPea Puffs", "Patata Salty"],
    bundle_upgrade: "Office Snack Box",
    frequently_bought_with: ["Wafer Rolls Hazelnut"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Stix Masala",
    category: "Multigrain Stix",
    price: "225",
    size: "50g",
    flavor_type: "savory",
    taste_tags: ["masala", "salty", "crunchy", "savory"],
    occasion_tags: ["office", "movie night", "travel"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["savory_snack"],
    kids_friendly: "maybe",
    spice_level: "medium",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Multi Grain Stix - Can Tray 5 +1"],
    cross_sell_products: ["Patata Masala", "Nachos Paprika"],
    bundle_upgrade: "All Time Favorites",
    frequently_bought_with: ["Banana Chips Sea Salt"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Nachos Salsa",
    category: "Nachos",
    price: "48.88",
    size: "50g",
    flavor_type: "spicy",
    taste_tags: ["spicy", "tangy", "crunchy", "savory"],
    occasion_tags: ["movie night", "party", "gaming", "netflix"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["spicy_caution", "savory_snack"],
    kids_friendly: "no",
    spice_level: "medium",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Nachos Pack Of 10", "Movie Night Nachos Bundle"],
    cross_sell_products: ["Nachos Paprika", "Movie Night Bundle"],
    bundle_upgrade: "Movie Night Nachos Bundle",
    frequently_bought_with: ["Patata Masala", "Choco Stick Chocolate"],
    best_seller: true,
    high_margin: false,
    trending: true,
  },
  {
    product_name: "Nachos Paprika",
    category: "Nachos",
    price: "48.88",
    size: "50g",
    flavor_type: "savory",
    taste_tags: ["mild", "masala", "crunchy", "savory"],
    occasion_tags: ["movie night", "party", "gaming", "netflix"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["savory_snack"],
    kids_friendly: "maybe",
    spice_level: "medium_low",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Nachos Pack Of 10", "Movie Night Nachos Bundle"],
    cross_sell_products: ["Nachos Salsa", "Patata Salty"],
    bundle_upgrade: "Movie Night Nachos Bundle",
    frequently_bought_with: ["Wafer Rolls Strawberry"],
    best_seller: true,
    high_margin: false,
    trending: true,
  },
  {
    product_name: "Patata Masala",
    category: "Potato Snacks",
    price: "213.97",
    size: "50g",
    flavor_type: "savory",
    taste_tags: ["masala", "salty", "crunchy", "savory"],
    occasion_tags: ["movie night", "office", "travel", "tea time"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["savory_snack"],
    kids_friendly: "maybe",
    spice_level: "medium",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Snaktory Patata Chips - Masala & Salty"],
    cross_sell_products: ["Patata Salty", "Stix Masala"],
    bundle_upgrade: "All Time Favorites",
    frequently_bought_with: ["Nachos Salsa"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Patata Salty",
    category: "Potato Snacks",
    price: "214.46",
    size: "50g",
    flavor_type: "mild_salty",
    taste_tags: ["mild", "salty", "crunchy", "savory"],
    occasion_tags: ["kids", "office", "tea time", "school lunch", "travel"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["kids_friendly", "savory_snack"],
    kids_friendly: "yes",
    spice_level: "low",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Snaktory Patata Chips - Masala & Salty"],
    cross_sell_products: ["ChickPea Puffs", "Wafer Rolls Strawberry"],
    bundle_upgrade: "Kids Fun Box",
    frequently_bought_with: ["Choco Stick Strawberry"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Banana Chips Sea Salt",
    category: "Banana Chips",
    price: "379.84",
    size: "100g",
    flavor_type: "mild_salty",
    taste_tags: ["mild", "salty", "crunchy", "savory"],
    occasion_tags: ["office", "tea time", "travel", "family"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["kids_friendly", "savory_snack"],
    kids_friendly: "yes",
    spice_level: "low",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Flavor Fiesta Bundle"],
    cross_sell_products: ["Banana Chips BBQ", "Wafer Rolls Hazelnut"],
    bundle_upgrade: "Office Snack Box",
    frequently_bought_with: ["Wafer Rolls Cappuccino"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Banana Chips BBQ",
    category: "Banana Chips",
    price: "369.05",
    size: "100g",
    flavor_type: "savory",
    taste_tags: ["salty", "masala", "crunchy", "savory"],
    occasion_tags: ["movie night", "office", "travel"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["savory_snack"],
    kids_friendly: "maybe",
    spice_level: "medium_low",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Flavor Fiesta Bundle"],
    cross_sell_products: ["Banana Chips Sea Salt", "Nachos Salsa"],
    bundle_upgrade: "Movie Night Bundle",
    frequently_bought_with: ["Wafer Rolls Strawberry"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Banana Chips Achari Masti",
    category: "Banana Chips",
    price: "393.63",
    size: "100g",
    flavor_type: "spicy",
    taste_tags: ["spicy", "tangy", "masala", "crunchy", "savory"],
    occasion_tags: ["movie night", "travel", "gaming"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["spicy_caution", "savory_snack"],
    kids_friendly: "no",
    spice_level: "medium_high",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Flavor Fiesta Bundle"],
    cross_sell_products: ["Stix Peri Peri", "Choco Stick Chocolate"],
    bundle_upgrade: "Crunch Munch Combo",
    frequently_bought_with: ["Wafer Rolls Hazelnut"],
    best_seller: false,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "ChickPea Puffs",
    category: "Snacks",
    price: "214.49",
    size: "70g",
    flavor_type: "mild_salty",
    taste_tags: ["mild", "salty", "crunchy", "savory"],
    occasion_tags: ["office", "school lunch", "travel", "tea time"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["kids_friendly", "savory_snack", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "low",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Office Snack Box"],
    cross_sell_products: ["Stix Salty", "Patata Salty"],
    bundle_upgrade: "Snack Sampler Deal",
    frequently_bought_with: ["Wafer Rolls Cappuccino"],
    best_seller: true,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Choco Stick Chocolate",
    category: "Sweet Snacks",
    price: "184.07",
    size: "35g",
    flavor_type: "sweet",
    taste_tags: ["sweet", "chocolate", "crunchy"],
    occasion_tags: ["kids", "gift", "tea time", "school lunch"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["sweet_snack", "kids_friendly", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "none",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Choco Lovers Bundle", "Choco Mania Bundle"],
    cross_sell_products: ["Choco Stick Strawberry", "Wafer Rolls Hazelnut"],
    bundle_upgrade: "Kids Fun Box",
    frequently_bought_with: ["Patata Salty"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Choco Stick Strawberry",
    category: "Sweet Snacks",
    price: "179.83",
    size: "35g",
    flavor_type: "sweet",
    taste_tags: ["sweet", "fruity", "crunchy"],
    occasion_tags: ["kids", "gift", "school lunch", "tea time"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["sweet_snack", "kids_friendly", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "none",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Choco Lovers Bundle", "Kids Fun Box"],
    cross_sell_products: ["Choco Stick Chocolate", "Patata Salty"],
    bundle_upgrade: "Kids Fun Box",
    frequently_bought_with: ["Wafer Rolls Strawberry"],
    best_seller: false,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Coco Choco Can",
    category: "Sweet Snacks",
    price: "210.06",
    size: "70g",
    flavor_type: "sweet",
    taste_tags: ["sweet", "chocolate", "crunchy"],
    occasion_tags: ["kids", "gift", "tea time", "family"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["sweet_snack", "kids_friendly", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "none",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Choco Mania Bundle"],
    cross_sell_products: ["Wafer Rolls Hazelnut", "Patata Salty"],
    bundle_upgrade: "Kids Fun Box",
    frequently_bought_with: ["Wafer Rolls Strawberry"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Wafer Rolls Hazelnut",
    category: "Sweet Snacks",
    price: "380.41",
    size: "80g",
    flavor_type: "sweet",
    taste_tags: ["sweet", "chocolate", "crunchy"],
    occasion_tags: ["gift", "tea time", "office", "family"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["sweet_snack", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "none",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Choco Lovers Bundle", "Snaktory Wafer Rolls Collection"],
    cross_sell_products: ["Wafer Rolls Cappuccino", "Choco Lovers Bundle"],
    bundle_upgrade: "Choco Lovers Bundle",
    frequently_bought_with: ["Banana Chips Sea Salt"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Wafer Rolls Strawberry",
    category: "Sweet Snacks",
    price: "378.86",
    size: "80g",
    flavor_type: "sweet",
    taste_tags: ["sweet", "fruity", "crunchy"],
    occasion_tags: ["kids", "gift", "tea time", "school lunch"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["sweet_snack", "kids_friendly", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "none",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Choco Mania Bundle", "Kids Fun Box"],
    cross_sell_products: ["Choco Stick Strawberry", "Patata Salty"],
    bundle_upgrade: "Kids Fun Box",
    frequently_bought_with: ["Coco Choco Can"],
    best_seller: false,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Wafer Rolls Cappuccino",
    category: "Sweet Snacks",
    price: "384.44",
    size: "80g",
    flavor_type: "sweet",
    taste_tags: ["sweet", "crunchy"],
    occasion_tags: ["office", "tea time", "gift", "family"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["sweet_snack", "allergy_check_required"],
    kids_friendly: "maybe",
    spice_level: "none",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Snaktory Wafer Rolls Collection", "Choco Lovers Bundle"],
    cross_sell_products: ["Wafer Rolls Hazelnut", "Banana Chips Sea Salt"],
    bundle_upgrade: "Office Snack Box",
    frequently_bought_with: ["ChickPea Puffs"],
    best_seller: true,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Wafer Rolls Dark Chocolate",
    category: "Sweet Snacks",
    price: "391.16",
    size: "80g",
    flavor_type: "sweet",
    taste_tags: ["sweet", "chocolate", "crunchy"],
    occasion_tags: ["gift", "tea time", "family"],
    price_tags: ["under_500"],
    product_type: "single_pack",
    safety_tags: ["sweet_snack", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "none",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Choco Lovers Bundle"],
    cross_sell_products: ["Choco Stick Chocolate", "Patata Salty"],
    bundle_upgrade: "Choco Lovers Bundle",
    frequently_bought_with: ["Banana Chips BBQ"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Nachos Pack Of 10",
    category: "Nachos",
    price: "500",
    size: "10 x 50g",
    flavor_type: "mixed_savory",
    taste_tags: ["crunchy", "savory", "spicy", "mild"],
    occasion_tags: ["party", "movie night", "family", "gaming", "netflix"],
    price_tags: ["under_1000"],
    product_type: "pack_of_6",
    safety_tags: ["savory_snack"],
    kids_friendly: "maybe",
    spice_level: "mixed",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Movie Night Nachos Bundle"],
    cross_sell_products: ["Stix Party", "Patata Salty"],
    bundle_upgrade: "Party Pleaser Bundle",
    frequently_bought_with: ["Choco Stick Chocolate"],
    best_seller: true,
    high_margin: false,
    trending: true,
  },
  {
    product_name: "Multi Grain Stix - Can Tray 5 +1",
    category: "Multigrain Stix",
    price: "1250",
    size: "6-can tray",
    flavor_type: "mixed_savory",
    taste_tags: ["crunchy", "savory", "spicy", "mild"],
    occasion_tags: ["office", "party", "family", "gift"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["savory_snack"],
    kids_friendly: "maybe",
    spice_level: "mixed",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Flavor Fiesta Bundle"],
    cross_sell_products: ["Nachos Pack Of 10", "Wafer Rolls Hazelnut"],
    bundle_upgrade: "All Time Favorites",
    frequently_bought_with: ["Coco Choco Can"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Snaktory Patata Chips - Masala & Salty",
    category: "Potato Snacks",
    price: "775",
    size: "combo pack",
    flavor_type: "mixed_savory",
    taste_tags: ["salty", "masala", "crunchy", "savory"],
    occasion_tags: ["office", "family", "travel", "tea time"],
    price_tags: ["under_1000"],
    product_type: "combo",
    safety_tags: ["savory_snack"],
    kids_friendly: "yes",
    spice_level: "mixed_low_medium",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["All Time Favorites"],
    cross_sell_products: ["ChickPea Puffs", "Wafer Rolls Strawberry"],
    bundle_upgrade: "Office Snack Box",
    frequently_bought_with: ["Choco Stick Chocolate"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Snaktory Wafer Rolls Collection",
    category: "Sweet Snacks",
    price: "1300",
    size: "collection box",
    flavor_type: "sweet",
    taste_tags: ["sweet", "chocolate", "fruity", "crunchy"],
    occasion_tags: ["gift", "family", "office", "tea time"],
    price_tags: ["under_2000"],
    product_type: "gift_box",
    safety_tags: ["sweet_snack", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "none",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Choco Lovers Bundle"],
    cross_sell_products: ["Coco Choco Can", "Banana Chips Sea Salt"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Patata Salty"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Snakitos Snaktory",
    category: "Snacks",
    price: "1125",
    size: "mixed box",
    flavor_type: "mixed",
    taste_tags: ["spicy", "sweet", "salty", "crunchy", "savory"],
    occasion_tags: ["family", "gift", "office", "party"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "maybe",
    spice_level: "mixed",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["All Time Favorites"],
    cross_sell_products: ["Snaktory Indulgence", "Snaktory Snack Pack"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Wafer Rolls Hazelnut"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Snakitos Snaktory Indulgence",
    category: "Snacks",
    price: "1125",
    size: "mixed premium box",
    flavor_type: "mixed",
    taste_tags: ["sweet", "crunchy", "savory"],
    occasion_tags: ["gift", "office", "family"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "mixed_low",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Choco Lovers Bundle"],
    cross_sell_products: ["Snaktory Wafer Rolls Collection", "Banana Chips Sea Salt"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Choco Stick Chocolate"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Snakitos Snaktory Snack Pack",
    category: "Snacks",
    price: "775",
    size: "mixed mini pack",
    flavor_type: "mixed",
    taste_tags: ["spicy", "sweet", "salty", "crunchy"],
    occasion_tags: ["office", "travel", "family"],
    price_tags: ["under_1000"],
    product_type: "combo",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "maybe",
    spice_level: "mixed",
    ingredients: "Check product page or packaging for exact ingredients.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "check_live_stock",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Snack Sampler Deal"],
    cross_sell_products: ["Patata Salty", "Choco Stick Chocolate"],
    bundle_upgrade: "All Time Favorites",
    frequently_bought_with: ["Wafer Rolls Hazelnut"],
    best_seller: false,
    high_margin: true,
    trending: false,
  },
  {
    product_name: "Kids Fun Box",
    category: "Bundles",
    price: "1499",
    size: "bundle",
    flavor_type: "sweet_mild_mix",
    taste_tags: ["sweet", "mild", "crunchy"],
    occasion_tags: ["kids", "school lunch", "gift", "family"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["kids_friendly", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "low",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Ultimate Mega Snack Box"],
    cross_sell_products: ["Choco Sticks", "Wafer Rolls", "Patata Salty"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Coco Choco Can"],
    best_seller: false,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Office Snack Box",
    category: "Bundles",
    price: "1899",
    size: "bundle",
    flavor_type: "mixed_mild",
    taste_tags: ["salty", "sweet", "crunchy", "savory"],
    occasion_tags: ["office", "tea time", "travel", "family"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "mixed_low_medium",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["All Time Favorites"],
    cross_sell_products: ["Banana Chips", "Wafer Rolls", "ChickPea Puffs"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Snaktory Snack Pack"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Movie Night Nachos Bundle",
    category: "Bundles",
    price: "1850",
    size: "bundle",
    flavor_type: "savory_spicy_mix",
    taste_tags: ["spicy", "mild", "crunchy", "savory"],
    occasion_tags: ["movie night", "gaming", "netflix", "party"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["savory_snack"],
    kids_friendly: "maybe",
    spice_level: "mixed_medium",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Party Pleaser Bundle"],
    cross_sell_products: ["Stix Party", "Nachos", "Patata"],
    bundle_upgrade: "Party Pleaser Bundle",
    frequently_bought_with: ["Choco Stick Chocolate"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Snack Sampler Deal",
    category: "Bundles",
    price: "1699",
    size: "bundle",
    flavor_type: "mixed",
    taste_tags: ["spicy", "sweet", "salty", "crunchy"],
    occasion_tags: ["new customer", "office", "family", "gift"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "maybe",
    spice_level: "mixed",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["All Time Favorites"],
    cross_sell_products: ["Snaktory Snack Pack", "Banana Chips Sea Salt"],
    bundle_upgrade: "All Time Favorites",
    frequently_bought_with: ["Wafer Rolls Hazelnut"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "All Time Favorites",
    category: "Bundles",
    price: "1999",
    size: "bundle",
    flavor_type: "mixed",
    taste_tags: ["spicy", "sweet", "salty", "crunchy", "savory"],
    occasion_tags: ["family", "gift", "office", "party"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "maybe",
    spice_level: "mixed",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Flavor Fiesta Bundle"],
    cross_sell_products: ["Office Snack Box", "Choco Lovers Bundle"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Banana Chips Sea Salt"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Choco Lovers Bundle",
    category: "Bundles",
    price: "1799",
    size: "bundle",
    flavor_type: "sweet",
    taste_tags: ["sweet", "chocolate", "fruity", "crunchy"],
    occasion_tags: ["gift", "kids", "tea time", "family"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["sweet_snack", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "none",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Choco Mania Bundle"],
    cross_sell_products: ["Wafer Rolls Hazelnut", "Patata Salty"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Banana Chips Sea Salt"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Choco Mania Bundle",
    category: "Bundles",
    price: "1950",
    size: "bundle",
    flavor_type: "sweet",
    taste_tags: ["sweet", "chocolate", "fruity", "crunchy"],
    occasion_tags: ["gift", "kids", "family", "party"],
    price_tags: ["under_2000"],
    product_type: "bundle",
    safety_tags: ["sweet_snack", "allergy_check_required"],
    kids_friendly: "yes",
    spice_level: "none",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Ultimate Mega Snack Box"],
    cross_sell_products: ["Patata Salty", "Banana Chips Sea Salt"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Wafer Rolls Hazelnut"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Flavor Fiesta Bundle",
    category: "Bundles",
    price: "3299",
    size: "large bundle",
    flavor_type: "mixed",
    taste_tags: ["spicy", "sweet", "salty", "crunchy", "savory"],
    occasion_tags: ["gift", "party", "family", "office"],
    price_tags: ["above_3000"],
    product_type: "party_pack",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "maybe",
    spice_level: "mixed",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Ultimate Mega Snack Box"],
    cross_sell_products: ["Party Pleaser Bundle", "Choco Lovers Bundle"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Movie Night Nachos Bundle"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Party Pleaser Bundle",
    category: "Bundles",
    price: "3499",
    size: "party bundle",
    flavor_type: "mixed_savory",
    taste_tags: ["spicy", "salty", "crunchy", "savory"],
    occasion_tags: ["party", "family", "movie night", "gaming"],
    price_tags: ["above_3000"],
    product_type: "party_pack",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "maybe",
    spice_level: "mixed_medium",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Ultimate Mega Snack Box"],
    cross_sell_products: ["Movie Night Bundle", "Flavor Fiesta Bundle"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Choco Lovers Bundle"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Crunch Munch Combo",
    category: "Bundles",
    price: "3199",
    size: "large combo",
    flavor_type: "mixed_crunchy",
    taste_tags: ["spicy", "sweet", "salty", "crunchy"],
    occasion_tags: ["party", "office", "family", "travel"],
    price_tags: ["above_3000"],
    product_type: "family_pack",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "maybe",
    spice_level: "mixed",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: ["Ultimate Mega Snack Box"],
    cross_sell_products: ["Flavor Fiesta Bundle", "Office Snack Box"],
    bundle_upgrade: "Ultimate Mega Snack Box",
    frequently_bought_with: ["Wafer Rolls Hazelnut"],
    best_seller: false,
    high_margin: true,
    trending: true,
  },
  {
    product_name: "Ultimate Mega Snack Box",
    category: "Bundles",
    price: "3999",
    size: "mega box",
    flavor_type: "mixed",
    taste_tags: ["spicy", "sweet", "salty", "crunchy", "savory"],
    occasion_tags: ["gift", "party", "family", "office", "movie night"],
    price_tags: ["above_3000"],
    product_type: "gift_box",
    safety_tags: ["allergy_check_required"],
    kids_friendly: "maybe",
    spice_level: "mixed",
    ingredients: "Bundle contents may vary. Check included product pages or packaging.",
    allergens: "Check packaging for accurate allergen details.",
    nutrition_facts: "Check packaging for exact nutrition facts.",
    shelf_life: "Check packaging for exact shelf life.",
    storage: "Store in a cool and dry place.",
    stock_status: "bundle_logic",
    product_url: "https://snakitos.com",
    image_url: "",
    upsell_products: [],
    cross_sell_products: ["Flavor Fiesta Bundle", "Party Pleaser Bundle"],
    bundle_upgrade: "",
    frequently_bought_with: ["Movie Night Nachos Bundle"],
    best_seller: true,
    high_margin: true,
    trending: true,
  },
];

const generalQueryTrainingDataset = [
  {
    id: "gq-001",
    intent: "what_do_you_sell",
    language: "english",
    user_query: "What do you sell?",
    ideal_answer:
      "Snakitos offers a wide range of snacks including Stix, Patata, Banana Chips, Choco Sticks, Wafer Rolls, ChickPea Puffs, Nachos, Snaktory packs, and snack bundles. Are you looking for spicy, sweet, kids-friendly, or mixed snacks?",
    recommended_products: ["All Time Favorites", "Snack Sampler Deal"],
    follow_up_question: "Would you like spicy, sweet, or mixed snacks?",
  },
  {
    id: "gq-002",
    intent: "product_recommendation",
    language: "english",
    user_query: "Recommend something",
    ideal_answer:
      "Sure! I can recommend the best option. What are you craving - spicy, sweet, salty, crunchy, or a mixed snack box?",
    recommended_products: [],
    follow_up_question: "Do you want spicy, sweet, or mixed snacks?",
  },
  {
    id: "gq-003",
    intent: "best_seller_query",
    language: "english",
    user_query: "What are your best sellers?",
    ideal_answer:
      "Some popular choices include Stix, Patata, Choco Sticks, Wafer Rolls, Banana Chips, and snack bundles. If you want better value, I recommend choosing a bundle.",
    recommended_products: ["All Time Favorites", "Office Snack Box", "Movie Night Nachos Bundle"],
    follow_up_question: "Would you like a spicy, sweet, or mixed best-seller bundle?",
  },
  {
    id: "gq-004",
    intent: "new_customer_query",
    language: "english",
    user_query: "I am new here",
    ideal_answer:
      "Welcome to Snakitos! If it's your first time, I'd suggest starting with a mixed bundle so you can try different flavors. Do you prefer spicy, sweet, or a mix of both?",
    recommended_products: ["Snack Sampler Deal", "All Time Favorites"],
    follow_up_question: "Would you like spicy, sweet, or mixed snacks?",
  },
  {
    id: "gq-005",
    intent: "price_objection",
    language: "english",
    user_query: "This feels expensive",
    ideal_answer:
      "I understand. If you want better value, I'd suggest choosing a bundle instead of individual items. Bundles usually give more variety and a better snack experience.",
    recommended_products: ["Snack Sampler Deal", "All Time Favorites"],
    follow_up_question: "Should I show you the best-value bundles under your budget?",
  },
  {
    id: "gq-006",
    intent: "shipping_charges",
    language: "english",
    user_query: "How much is shipping?",
    ideal_answer:
      "Delivery charges may depend on your city, order value, and current offer. Please check the checkout page for the exact delivery charge.",
    recommended_products: [],
    follow_up_question: "Would you like help finding snacks before checkout?",
  },
  {
    id: "gq-007",
    intent: "delivery_time",
    language: "english",
    user_query: "How long does delivery take?",
    ideal_answer:
      "Delivery time depends on your city and courier service. Major cities are usually faster, while other areas may take a little longer.",
    recommended_products: [],
    follow_up_question: "Would you like me to help you choose snacks while you're here?",
  },
  {
    id: "gq-008",
    intent: "cod_query",
    language: "english",
    user_query: "Do you have COD?",
    ideal_answer:
      "Cash on Delivery may be available depending on your city and order type. You can confirm available payment options at checkout.",
    recommended_products: [],
    follow_up_question: "Would you like help picking a snack box before checkout?",
  },
  {
    id: "gq-009",
    intent: "payment_query",
    language: "english",
    user_query: "Can I pay online?",
    ideal_answer:
      "Available payment options will appear at checkout. Please use only official Snakitos checkout or official support channels.",
    recommended_products: [],
    follow_up_question: "Would you like a quick snack recommendation too?",
  },
  {
    id: "gq-010",
    intent: "refund_query",
    language: "english",
    user_query: "What is your refund policy?",
    ideal_answer:
      "Because these are food items, returns and refunds may be limited for hygiene and safety reasons. If you received a damaged, wrong, or defective item, contact support with proof.",
    recommended_products: [],
    follow_up_question: "Do you need refund guidance or help choosing a product?",
  },
  {
    id: "gq-011",
    intent: "damaged_product",
    language: "english",
    user_query: "My product arrived damaged",
    ideal_answer:
      "I'm sorry about that. Please share your order number and clear photos/videos of the damaged items and packaging so support can review your claim.",
    recommended_products: [],
    follow_up_question: "Would you like the support handoff wording too?",
  },
  {
    id: "gq-012",
    intent: "wrong_product",
    language: "english",
    user_query: "I received the wrong item",
    ideal_answer:
      "Sorry for the inconvenience. Please share your order number and a photo of the product received so support can check and guide you.",
    recommended_products: [],
    follow_up_question: "Would you like help wording the support message?",
  },
  {
    id: "gq-013",
    intent: "halal_query",
    language: "english",
    user_query: "Are your products halal?",
    ideal_answer:
      "Yes, Snakitos is a brand by FM Foods, and FM Foods publicly lists Halal certification as part of its quality and food safety standards.",
    recommended_products: [],
    follow_up_question: "Would you like help finding a snack after that?",
  },
  {
    id: "gq-014",
    intent: "certification_query",
    language: "english",
    user_query: "What certifications do you have?",
    ideal_answer:
      "Snakitos is a brand by FM Foods. FM Foods lists several food safety and quality standards, including Halal, ISO 22000, HACCP, SFDA, and FDA-related approvals/compliance.",
    recommended_products: [],
    follow_up_question: "Do you want a product recommendation as well?",
  },
  {
    id: "gq-015",
    intent: "ingredient_query",
    language: "english",
    user_query: "What are the ingredients?",
    ideal_answer:
      "Ingredients vary by product. Please check the product page or packaging for the exact ingredient list. If you share the product name, I can help guide you.",
    recommended_products: [],
    follow_up_question: "Which product would you like to check?",
  },
  {
    id: "gq-016",
    intent: "allergen_query",
    language: "english",
    user_query: "Any allergens?",
    ideal_answer:
      "Allergen information can vary by product. Please check the packaging for the most accurate allergen details. If you have a serious allergy, please confirm with support before placing the order.",
    recommended_products: [],
    follow_up_question: "Which product are you asking about?",
  },
  {
    id: "gq-017",
    intent: "product_recommendation",
    language: "roman_urdu",
    user_query: "Bhai kuch recommend karo",
    ideal_answer:
      "Zaroor! Aap spicy, sweet, salty, crunchy, ya mixed snack box mein se kya lena chahenge?",
    recommended_products: [],
    follow_up_question: "Aapka mood kis type ke snacks ka hai?",
  },
  {
    id: "gq-018",
    intent: "spicy_recommendation",
    language: "roman_urdu",
    user_query: "Bhai spicy snacks batao",
    ideal_answer:
      "Zaroor! Agar aapko spicy snacks pasand hain to Stix Hot & Spicy, Stix Peri Peri, Stix Lemon & Chilli, aur Nachos Salsa try karein. Aap single packs lena chahenge ya spicy bundle?",
    recommended_products: ["Stix Hot & Spicy", "Stix Peri Peri", "Movie Night Nachos Bundle"],
    follow_up_question: "Single pack chahiye ya bundle?",
  },
  {
    id: "gq-019",
    intent: "kids_recommendation",
    language: "roman_urdu",
    user_query: "Kids ke liye kya acha hai?",
    ideal_answer:
      "Kids ke liye Choco Stick, Coco Choco Can, Wafer Rolls Strawberry, aur Patata Salty achay options hain. Agar ready mix chahiye to Kids Fun Box best rahega.",
    recommended_products: ["Kids Fun Box", "Choco Stick Chocolate", "Patata Salty"],
    follow_up_question: "Sweet chahiye ya mixed kids box?",
  },
  {
    id: "gq-020",
    intent: "sweet_recommendation",
    language: "roman_urdu",
    user_query: "Kuch meetha recommend karo",
    ideal_answer:
      "Sweet craving ke liye Choco Stick Chocolate, Choco Stick Strawberry, Wafer Rolls Hazelnut, aur Coco Choco Can best options hain.",
    recommended_products: ["Choco Lovers Bundle", "Choco Stick Chocolate", "Wafer Rolls Hazelnut"],
    follow_up_question: "Single snack chahiye ya sweet bundle?",
  },
];

const productFaqDataset = [
  {
    question: "What do you sell?",
    answer:
      "Snakitos offers a wide range of snacks including Stix, Patata, Banana Chips, Choco Sticks, Wafer Rolls, ChickPea Puffs, Nachos, Snaktory packs, and snack bundles. Are you looking for spicy, sweet, kids-friendly, or mixed snacks?",
    category: "General brand questions",
    related_products: ["Snack Sampler Deal", "All Time Favorites"],
    safe_upsell: "Snack Sampler Deal",
    escalation_required: false,
  },
  {
    question: "Which snacks are spicy?",
    answer:
      "For spicy options, try Stix Hot & Spicy, Stix Peri Peri, Stix Lemon & Chilli, Nachos Salsa, Nachos Paprika, or Banana Chips Achari Masti.",
    category: "Product questions",
    related_products: ["Stix Hot & Spicy", "Stix Peri Peri", "Movie Night Nachos Bundle"],
    safe_upsell: "Movie Night Nachos Bundle",
    escalation_required: false,
  },
  {
    question: "Which snacks are sweet?",
    answer:
      "Sweet picks include Choco Stick Chocolate, Choco Stick Strawberry, Coco Choco Can, Wafer Rolls Hazelnut, Wafer Rolls Strawberry, and Wafer Rolls Cappuccino.",
    category: "Product questions",
    related_products: ["Choco Lovers Bundle", "Choco Mania Bundle"],
    safe_upsell: "Choco Lovers Bundle",
    escalation_required: false,
  },
  {
    question: "Are your snacks halal?",
    answer:
      "Yes, Snakitos is a brand by FM Foods, and FM Foods publicly lists Halal certification as part of its quality and food safety standards.",
    category: "Halal questions",
    related_products: [],
    safe_upsell: "",
    escalation_required: false,
  },
  {
    question: "What certifications do you have?",
    answer:
      "Snakitos is a brand by FM Foods. FM Foods lists several food safety and quality standards, including Halal, ISO 22000, HACCP, SFDA, and FDA-related approvals/compliance.",
    category: "Certification questions",
    related_products: [],
    safe_upsell: "",
    escalation_required: false,
  },
  {
    question: "What are the ingredients in this snack?",
    answer:
      "Ingredients vary by product. Please check the product page or packaging for the exact ingredient list. If you share the product name, I can help guide you.",
    category: "Ingredients",
    related_products: [],
    safe_upsell: "",
    escalation_required: false,
  },
  {
    question: "Does this contain allergens?",
    answer:
      "Allergen information can vary by product. Please check the packaging for the most accurate allergen details. If you have a serious allergy, please confirm with support before placing the order.",
    category: "Allergens",
    related_products: [],
    safe_upsell: "",
    escalation_required: true,
  },
  {
    question: "Is this vegan?",
    answer:
      "I'm not fully sure about that information, and I don't want to misguide you. Please check the packaging or confirm with support before ordering.",
    category: "Vegan/vegetarian",
    related_products: [],
    safe_upsell: "",
    escalation_required: true,
  },
  {
    question: "Which snacks are good for kids?",
    answer:
      "Kids usually enjoy Choco Stick Chocolate, Choco Stick Strawberry, Coco Choco Can, Wafer Rolls Strawberry, and Patata Salty. If you want a ready option, Kids Fun Box is a strong pick.",
    category: "Kids safety",
    related_products: ["Kids Fun Box", "Choco Stick Chocolate", "Patata Salty"],
    safe_upsell: "Kids Fun Box",
    escalation_required: false,
  },
  {
    question: "Is this very spicy?",
    answer:
      "Spice level depends on the product. Stix Hot & Spicy is a stronger spicy option, while Stix Lemon & Chilli and Nachos Paprika are usually easier starting points.",
    category: "Spicy level",
    related_products: ["Stix Hot & Spicy", "Stix Lemon & Chilli", "Nachos Paprika"],
    safe_upsell: "Movie Night Nachos Bundle",
    escalation_required: false,
  },
  {
    question: "How much are delivery charges?",
    answer:
      "Delivery charges may depend on your city, order value, and current offer. Please check the checkout page for the exact delivery charge.",
    category: "Delivery charges",
    related_products: [],
    safe_upsell: "",
    escalation_required: false,
  },
  {
    question: "How long does delivery take?",
    answer:
      "Delivery time depends on your city and courier service. Major cities are usually faster, while other areas may take a little longer.",
    category: "Shipping",
    related_products: [],
    safe_upsell: "",
    escalation_required: false,
  },
  {
    question: "Do you offer COD?",
    answer:
      "Cash on Delivery may be available depending on your city and order type. You can confirm available payment options at checkout.",
    category: "COD",
    related_products: [],
    safe_upsell: "",
    escalation_required: false,
  },
  {
    question: "Can I pay online?",
    answer:
      "Available payment options will appear at checkout. Please use only official Snakitos checkout or official support channels.",
    category: "Online payment",
    related_products: [],
    safe_upsell: "",
    escalation_required: false,
  },
  {
    question: "Can I get a refund?",
    answer:
      "Because these are food items, returns and refunds may be limited for hygiene and safety reasons. If you received a damaged, wrong, or defective item, contact support with proof.",
    category: "Refunds",
    related_products: [],
    safe_upsell: "",
    escalation_required: true,
  },
  {
    question: "Can I return snacks if I change my mind?",
    answer:
      "Because these are food items, returns may be limited for hygiene and safety reasons. Please contact support if there is a damaged, wrong, or defective item.",
    category: "Returns",
    related_products: [],
    safe_upsell: "",
    escalation_required: true,
  },
  {
    question: "My product is damaged",
    answer:
      "I'm sorry about that. Please share your order number and clear photos/videos of the damaged items and packaging so support can review your claim.",
    category: "Damaged product",
    related_products: [],
    safe_upsell: "",
    escalation_required: true,
  },
  {
    question: "You sent the wrong item",
    answer:
      "Sorry for the inconvenience. Please share your order number and a photo of the product received so support can check and guide you.",
    category: "Wrong product",
    related_products: [],
    safe_upsell: "",
    escalation_required: true,
  },
  {
    question: "Do you have discounts or coupons?",
    answer:
      "Available discounts and coupon offers can change, so the best place to confirm them is the current product page, cart, or checkout.",
    category: "Discounts",
    related_products: ["Snack Sampler Deal", "All Time Favorites"],
    safe_upsell: "Snack Sampler Deal",
    escalation_required: false,
  },
  {
    question: "Do you take bulk or corporate orders?",
    answer:
      "For bulk orders, corporate gifting, or event orders, please contact support so the team can guide you properly.",
    category: "Bulk orders",
    related_products: ["Party Pleaser Bundle", "Ultimate Mega Snack Box"],
    safe_upsell: "Party Pleaser Bundle",
    escalation_required: true,
  },
  {
    question: "Are your snacks fresh?",
    answer:
      "Snakitos products should be handled as fresh stock, but for exact dates please check the packaging after delivery.",
    category: "Freshness",
    related_products: [],
    safe_upsell: "",
    escalation_required: false,
  },
  {
    question: "How should I store the snacks?",
    answer:
      "Please keep them in a cool and dry place, and always check the product packaging for exact storage guidance.",
    category: "Storage",
    related_products: [],
    safe_upsell: "",
    escalation_required: false,
  },
  {
    question: "This is too expensive",
    answer:
      "I understand. If you want better value, I'd suggest choosing a bundle instead of individual items. Bundles usually give more variety and a better snack experience.",
    category: "Price objections",
    related_products: ["Snack Sampler Deal", "All Time Favorites", "Office Snack Box"],
    safe_upsell: "All Time Favorites",
    escalation_required: false,
  },
];

const productRecommendationDataset = [
  {
    id: "rec-spicy-001",
    trigger_type: "taste",
    trigger_value: "spicy",
    response_style: "friendly_sales",
    primary_recommendations: [
      "Stix Hot & Spicy",
      "Stix Peri Peri",
      "Stix Lemon & Chilli",
      "Nachos Salsa",
      "Nachos Paprika",
      "Banana Chips Achari Masti",
    ],
    bundle_priority: ["Movie Night Nachos Bundle", "Flavor Fiesta Bundle", "Party Pleaser Bundle"],
    balancing_add_on: "Choco Stick Chocolate",
    follow_up_question: "Would you like a single spicy snack or a bundle for better value?",
  },
  {
    id: "rec-sweet-001",
    trigger_type: "taste",
    trigger_value: "sweet",
    response_style: "friendly_sales",
    primary_recommendations: [
      "Choco Stick Chocolate",
      "Choco Stick Strawberry",
      "Coco Choco Can",
      "Wafer Rolls Hazelnut",
      "Wafer Rolls Strawberry",
      "Wafer Rolls Cappuccino",
    ],
    bundle_priority: ["Choco Lovers Bundle", "Choco Mania Bundle"],
    balancing_add_on: "Patata Salty",
    follow_up_question: "Would you like a sweet bundle or a few single picks?",
  },
  {
    id: "rec-mild-001",
    trigger_type: "taste",
    trigger_value: "mild_salty",
    response_style: "friendly_sales",
    primary_recommendations: [
      "Patata Salty",
      "Banana Chips Sea Salt",
      "ChickPea Puffs",
      "Stix Salty",
    ],
    bundle_priority: ["Office Snack Box", "Kids Fun Box"],
    balancing_add_on: "Choco Stick Strawberry",
    follow_up_question: "Do you want kids-friendly or office-friendly options?",
  },
  {
    id: "rec-crunchy-001",
    trigger_type: "taste",
    trigger_value: "crunchy",
    response_style: "friendly_sales",
    primary_recommendations: [
      "Patata Masala",
      "Patata Salty",
      "Stix Peri Peri",
      "Nachos Salsa",
      "Banana Chips Sea Salt",
      "ChickPea Puffs",
    ],
    bundle_priority: ["Snack Sampler Deal", "Crunch Munch Combo"],
    balancing_add_on: "Wafer Rolls Hazelnut",
    follow_up_question: "Do you want spicy crunchy snacks or more mild crunchy ones?",
  },
  {
    id: "rec-budget-500",
    trigger_type: "budget",
    trigger_value: "under_500",
    response_style: "value_first",
    primary_recommendations: [
      "Choco Stick Chocolate",
      "Patata Salty",
      "Stix Peri Peri",
      "ChickPea Puffs",
      "Banana Chips Sea Salt",
      "Wafer Rolls Hazelnut",
    ],
    bundle_priority: [],
    balancing_add_on: "",
    follow_up_question: "Would you like sweet, spicy, or mixed picks under Rs. 500?",
  },
  {
    id: "rec-budget-1000",
    trigger_type: "budget",
    trigger_value: "under_1000",
    response_style: "value_first",
    primary_recommendations: [
      "Nachos Pack Of 10",
      "Snaktory Snack Pack",
      "Snaktory Patata Chips - Masala & Salty",
    ],
    bundle_priority: ["Snaktory Snack Pack"],
    balancing_add_on: "Choco Stick Chocolate",
    follow_up_question: "Do you want a savory combo or a mixed starter box?",
  },
  {
    id: "rec-budget-2000",
    trigger_type: "budget",
    trigger_value: "under_2000",
    response_style: "value_first",
    primary_recommendations: [
      "All Time Favorites",
      "Choco Lovers Bundle",
      "Office Snack Box",
      "Movie Night Nachos Bundle",
      "Snack Sampler Deal",
    ],
    bundle_priority: [
      "All Time Favorites",
      "Snack Sampler Deal",
      "Movie Night Nachos Bundle",
    ],
    balancing_add_on: "",
    follow_up_question: "Which matters more to you: variety, spicy flavor, or gifting?",
  },
  {
    id: "rec-budget-3000-plus",
    trigger_type: "budget",
    trigger_value: "above_3000",
    response_style: "value_first",
    primary_recommendations: [
      "Ultimate Mega Snack Box",
      "Flavor Fiesta Bundle",
      "Party Pleaser Bundle",
      "Crunch Munch Combo",
    ],
    bundle_priority: [
      "Ultimate Mega Snack Box",
      "Party Pleaser Bundle",
      "Flavor Fiesta Bundle",
    ],
    balancing_add_on: "",
    follow_up_question: "Is this for gifting, a party, or a family snack stock-up?",
  },
  {
    id: "rec-occasion-movie-night",
    trigger_type: "occasion",
    trigger_value: "movie night",
    response_style: "occasion_first",
    primary_recommendations: ["Nachos Salsa", "Patata Masala", "Stix Peri Peri"],
    bundle_priority: ["Movie Night Nachos Bundle", "Party Pleaser Bundle"],
    balancing_add_on: "Choco Stick Chocolate",
    follow_up_question: "How many people are you buying for?",
  },
  {
    id: "rec-occasion-kids",
    trigger_type: "occasion",
    trigger_value: "kids",
    response_style: "occasion_first",
    primary_recommendations: [
      "Choco Stick Chocolate",
      "Coco Choco Can",
      "Wafer Rolls Strawberry",
      "Patata Salty",
    ],
    bundle_priority: ["Kids Fun Box", "Choco Lovers Bundle"],
    balancing_add_on: "",
    follow_up_question: "Do you want mostly sweet snacks or a balanced kids mix?",
  },
  {
    id: "rec-occasion-office",
    trigger_type: "occasion",
    trigger_value: "office",
    response_style: "occasion_first",
    primary_recommendations: ["Banana Chips Sea Salt", "Wafer Rolls Cappuccino", "ChickPea Puffs"],
    bundle_priority: ["Office Snack Box", "All Time Favorites"],
    balancing_add_on: "",
    follow_up_question: "Is this for one person or for team sharing?",
  },
  {
    id: "rec-occasion-gift",
    trigger_type: "occasion",
    trigger_value: "gift",
    response_style: "occasion_first",
    primary_recommendations: ["Wafer Rolls Hazelnut", "Coco Choco Can"],
    bundle_priority: ["Ultimate Mega Snack Box", "All Time Favorites", "Choco Lovers Bundle"],
    balancing_add_on: "",
    follow_up_question: "Would you like a premium gift box or a budget-friendly gift bundle?",
  },
];

const productTaggingStructure = {
  taste_tags: ["spicy", "mild", "sweet", "salty", "chocolate", "fruity", "masala", "tangy", "crunchy", "savory"],
  occasion_tags: ["kids", "office", "movie night", "family", "party", "gift", "tea time", "school lunch", "travel", "gaming", "netflix"],
  price_tags: ["under_500", "under_1000", "under_2000", "above_3000"],
  product_type_tags: ["single_pack", "pack_of_6", "combo", "bundle", "family_pack", "party_pack", "gift_box"],
  safety_tags: ["kids_friendly", "spicy_caution", "allergy_check_required", "sweet_snack", "savory_snack"],
  metadata_filtering_guide: {
    exact_product_match_fields: ["product_name"],
    category_fields: ["category", "product_type"],
    discovery_fields: ["taste_tags", "occasion_tags", "price_tags", "best_seller", "trending"],
    compliance_fields: ["kids_friendly", "safety_tags", "spice_level"],
    operations_fields: ["stock_status", "product_url", "image_url"],
  },
};

const faqJsonTemplate = {
  question: "",
  answer: "",
  category: "",
  related_products: [],
  safe_upsell: "",
  escalation_required: false,
};

const salesRuleJsonTemplate = {
  sales_rules: [
    {
      id: "upsell-single-to-bundle",
      when: "customer asks for one specific product",
      do: "suggest one related flavor and one bundle upgrade",
      example:
        "Great choice! If you enjoy this flavor, you may also like a related flavor or a bundle for better value.",
    },
    {
      id: "balance-spicy-with-sweet",
      when: "customer wants spicy snacks",
      do: "suggest one sweet add-on",
      example: "Want something sweet to balance the spice? Choco Stick or Wafer Rolls pair nicely.",
    },
    {
      id: "balance-sweet-with-salty",
      when: "customer wants sweet snacks",
      do: "suggest one salty or crunchy add-on",
      example: "You can add Patata Salty or Stix Salty to make your snack box more balanced.",
    },
    {
      id: "bundle-first-occasion",
      when: "customer mentions party, office, gift, kids, or movie night",
      do: "recommend bundles first, then singles",
      example: "For movie night, I'd start with Movie Night Nachos Bundle for better variety.",
    },
    {
      id: "free-shipping-threshold",
      when: "cart total is close to free shipping threshold",
      do: "suggest one light add-on only if it improves value",
      example: "You're close to free shipping. Adding one more snack may give you better value.",
    },
  ],
};

const crossSellMatrix = {
  "Stix Hot & Spicy": {
    cross_sell: ["Stix Peri Peri", "Nachos Salsa", "Choco Stick Chocolate"],
    upsell: ["Flavor Fiesta Bundle", "Multi Grain Stix - Can Tray 5 +1"],
  },
  "Stix Peri Peri": {
    cross_sell: ["Stix Lemon & Chilli", "Patata Masala"],
    upsell: ["Flavor Fiesta Bundle", "Multi Grain Stix - Can Tray 5 +1"],
  },
  "Nachos Salsa": {
    cross_sell: ["Nachos Paprika", "Movie Night Bundle"],
    upsell: ["Movie Night Nachos Bundle", "Party Pleaser Bundle"],
  },
  "Patata Masala": {
    cross_sell: ["Patata Salty", "Stix Masala"],
    upsell: ["All Time Favorites", "Snaktory Patata Chips - Masala & Salty"],
  },
  "Banana Chips Sea Salt": {
    cross_sell: ["Banana Chips BBQ", "Wafer Rolls Hazelnut"],
    upsell: ["Office Snack Box", "Flavor Fiesta Bundle"],
  },
  "Choco Stick Chocolate": {
    cross_sell: ["Choco Stick Strawberry", "Wafer Rolls Hazelnut"],
    upsell: ["Choco Lovers Bundle", "Choco Mania Bundle"],
  },
  "Wafer Rolls Hazelnut": {
    cross_sell: ["Wafer Rolls Cappuccino", "Choco Lovers Bundle"],
    upsell: ["Choco Lovers Bundle", "Ultimate Mega Snack Box"],
  },
  "ChickPea Puffs": {
    cross_sell: ["Stix Salty", "Patata Salty"],
    upsell: ["Office Snack Box", "Snack Sampler Deal"],
  },
  "Kids Fun Box": {
    cross_sell: ["Choco Sticks", "Wafer Rolls", "Patata Salty"],
    upsell: ["Ultimate Mega Snack Box"],
  },
  "Office Snack Box": {
    cross_sell: ["All Time Favorites", "Banana Chips", "Wafer Rolls"],
    upsell: ["Ultimate Mega Snack Box"],
  },
  "Movie Night Bundle": {
    cross_sell: ["Stix Party", "Nachos", "Patata"],
    upsell: ["Party Pleaser Bundle", "Ultimate Mega Snack Box"],
  },
};

const antiHallucinationFallbacks = [
  {
    use_case: "unknown_ingredients",
    fallback:
      "Ingredients vary by product. Please check the product page or packaging for the exact ingredient list. If you share the product name, I can help guide you.",
  },
  {
    use_case: "unknown_allergens",
    fallback:
      "Allergen information can vary by product. Please check the packaging for the most accurate allergen details. If you have a serious allergy, please confirm with support before placing the order.",
  },
  {
    use_case: "unknown_vegan_status",
    fallback:
      "I'm not fully sure about that information, and I don't want to misguide you. Please check the packaging or confirm with support before ordering.",
  },
  {
    use_case: "unknown_nutrition",
    fallback:
      "I don't have confirmed nutrition details for that product right now, so I'd recommend checking the packaging or product page for the exact values.",
  },
  {
    use_case: "unknown_shelf_life",
    fallback:
      "I don't want to guess the exact shelf life. Please check the product packaging for the most accurate date and storage guidance.",
  },
  {
    use_case: "unknown_stock_restock_date",
    fallback:
      "I can help check current availability, but I can't confirm an exact restock date unless it is officially updated.",
  },
  {
    use_case: "refund_approval_request",
    fallback:
      "I can guide you on the refund process, but I can't approve refunds in chat. Please share your order details and proof with support for review.",
  },
  {
    use_case: "delivery_date_request",
    fallback:
      "Delivery time depends on your city and courier service, so I don't want to promise an exact date. The best estimate will appear at checkout or from support after dispatch.",
  },
  {
    use_case: "certificate_number_request",
    fallback:
      "I can share the certification overview, but I don't have confirmed certificate numbers in chat. Please contact support if you need official documentation.",
  },
  {
    use_case: "order_tracking_request",
    fallback:
      "Please use the Track Order option or share your order details with support.",
  },
];

const intentClassifierPrompt = `Classify the customer message into exactly one Snakitos intent.

General intents:
- general_brand_query
- what_do_you_sell
- best_seller_query
- new_customer_query
- price_objection
- discount_query
- coupon_query
- support_request

Product intents:
- product_recommendation
- spicy_recommendation
- sweet_recommendation
- salty_recommendation
- crunchy_recommendation
- kids_recommendation
- office_recommendation
- movie_night_recommendation
- party_recommendation
- gifting_recommendation
- budget_recommendation
- halal_query
- certification_query
- ingredient_query
- allergen_query
- vegan_query
- spice_level_query
- availability_query

Policy intents:
- shipping_charges
- delivery_time
- cod_query
- payment_query
- refund_query
- return_query
- damaged_product
- wrong_product
- cancellation_query

Business intents:
- wholesale_query
- bulk_order_query
- corporate_gifting
- event_order

Rules:
1. Return one JSON object only.
2. JSON format:
{"intent":"","language":"english|roman_urdu|mixed","confidence":0-1,"reasoning_tags":[]}
3. Prefer product_recommendation when the customer is browsing broadly.
4. If the customer asks about order tracking, do not classify into a product intent. Use support_request or the app's order flow outside this classifier.
5. Roman Urdu examples:
- "bhai spicy snacks batao" => spicy_recommendation
- "kids ke liye kya acha hai" => kids_recommendation
- "2000 ke andar kuch acha batao" => budget_recommendation
- "halal hai?" => halal_query
- "cod hai?" => cod_query
6. Price-only frustration like "mehnga hai" or "too expensive" => price_objection
7. Keep reasoning tags short, like ["spicy","budget","roman_urdu"].`;

const finalSystemPrompt = `You are Snakitos AI Assistant, a friendly snack expert and ecommerce sales assistant for Snakitos.

Your job is to answer general customer questions, recommend products, explain product categories, suggest bundles, answer product FAQs, help with shipping/payment/refund questions, and guide customers toward the best snack choice.

Order tracking is already handled by a separate flow. If the user asks about order tracking, guide them to the Track Order option or ask them to contact support.

Use only the provided product database, FAQ database, policy database, certification database, and sales rules. Do not invent ingredients, allergens, nutrition facts, delivery dates, stock arrival dates, refund approvals, certification numbers, wholesale rates, or payment verification.

When recommending products, use customer taste, budget, and occasion. Prefer bundles when they offer better value. Suggest add-ons naturally, such as sweet snacks with spicy snacks or salty snacks with sweet snacks.

Speak in simple English or Roman Urdu based on the customer's language. Be friendly, helpful, slightly playful, and not pushy.

Always follow this structure:
1. Answer the customer directly.
2. Recommend product, bundle, or next step.
3. Ask one simple follow-up question if needed.

Opening message:
${openingMessage}

Sales rules:
- If a customer asks for one product, suggest a bundle or related flavor.
- If a customer wants spicy snacks, suggest one sweet add-on.
- If a customer wants sweet snacks, suggest one salty or crunchy add-on.
- If the customer mentions party, office, gift, kids, or movie night, recommend a bundle first.
- If the cart is close to a free shipping threshold, suggest one light add-on only when it improves value.

Safety rules:
- Never guess exact ingredients, exact allergens, exact nutrition facts, exact shelf life, exact stock restock date, refund approval, courier delivery date, certificate numbers, wholesale rates, or private customer order details.
- For ingredients, allergens, vegan status, or medical-style concerns, recommend checking packaging or support if the answer is not confirmed.
- For damaged or wrong items, collect proof and route to support.

Your first priority is accuracy and customer trust.
Your second priority is increasing sales and conversion.`;

const romanUrduTestCases = [
  { query: "Bhai spicy snacks batao", expected_intent: "spicy_recommendation" },
  { query: "Kids ke liye kya acha hai?", expected_intent: "kids_recommendation" },
  { query: "Kuch meetha recommend karo", expected_intent: "sweet_recommendation" },
  { query: "2000 ke andar kuch acha batao", expected_intent: "budget_recommendation" },
  { query: "COD hai?", expected_intent: "cod_query" },
  { query: "Halal hai?", expected_intent: "halal_query" },
  { query: "Ingredients kya hain?", expected_intent: "ingredient_query" },
  { query: "Allergy ka masla hai, is mein kya hota hai?", expected_intent: "allergen_query" },
  { query: "Office ke liye bundle batao", expected_intent: "office_recommendation" },
  { query: "Movie night ke liye kuch crunchy chahiye", expected_intent: "movie_night_recommendation" },
  { query: "Mujhe gift dena hai, kya loon?", expected_intent: "gifting_recommendation" },
  { query: "Yeh thora mehnga lag raha hai", expected_intent: "price_objection" },
  { query: "Delivery kitne din mein hoti hai?", expected_intent: "delivery_time" },
  { query: "Refund mil sakta hai?", expected_intent: "refund_query" },
  { query: "Wrong product receive hua hai", expected_intent: "wrong_product" },
];

const weeklyImprovementProcess = `# Weekly Improvement Process for Snakitos Product and General Queries

1. Export the last 7 days of failed, escalated, abandoned, and low-confidence chats.
2. Bucket failures into intent gaps, retrieval gaps, policy gaps, product-tag gaps, and response-style gaps.
3. Review the top 20 missed queries manually and write the exact customer phrasing, especially Roman Urdu variations.
4. Add missing FAQs when the answer is stable and policy-backed.
5. Add or refine product tags when the bot failed to connect taste, budget, or occasion correctly.
6. Update cross-sell and upsell mappings if customers clicked but did not convert.
7. Mark risky questions involving allergens, vegan status, halal proof, refunds, or stock promises and confirm the fallback stayed safe.
8. Re-run the 300 test cases plus the failed real chats before publishing updates.
9. Compare weekly metrics:
   - answer rate without escalation
   - recommendation click-through rate
   - add-to-cart rate after chatbot replies
   - bundle recommendation acceptance
   - average order value after chatbot sessions
   - fallback rate on ingredients/allergens
10. Promote only the changes that improve both accuracy and conversion without increasing hallucination risk.

## Failure Labels
- intent_missed
- wrong_product_rank
- weak_bundle_offer
- missed_cross_sell
- unsafe_ingredient_answer
- unsafe_allergen_answer
- refund_overclaim
- delivery_overpromise
- roman_urdu_misread
- no_follow_up_question

## Fast Fix Playbook
- If users say "recommend something" and bounce, make the first follow-up simpler.
- If users ask for budget and get single items, boost bundle ranking for under_1000 and under_2000.
- If spicy shoppers do not add to cart, test a spicy + sweet pairing more often.
- If Roman Urdu queries fail, add the exact phrasing into keyword hints and test cases.
- If halal or certification answers trigger confusion, keep the wording careful and consistent across all datasets.
`;

const tasteBundles = {
  spicy: ["Stix Hot & Spicy", "Stix Peri Peri", "Stix Lemon & Chilli", "Nachos Salsa", "Nachos Paprika", "Banana Chips Achari Masti"],
  sweet: ["Choco Stick Chocolate", "Choco Stick Strawberry", "Coco Choco Can", "Wafer Rolls Hazelnut", "Wafer Rolls Strawberry", "Wafer Rolls Cappuccino"],
  salty: ["Patata Salty", "Banana Chips Sea Salt", "ChickPea Puffs", "Stix Salty"],
  crunchy: ["Patata Masala", "Stix Peri Peri", "Nachos Salsa", "Banana Chips Sea Salt", "ChickPea Puffs"],
};

const occasionBundles = {
  kids: ["Kids Fun Box", "Choco Stick Chocolate", "Wafer Rolls Strawberry"],
  office: ["Office Snack Box", "Banana Chips Sea Salt", "ChickPea Puffs"],
  "movie night": ["Movie Night Nachos Bundle", "Nachos Salsa", "Stix Peri Peri"],
  party: ["Party Pleaser Bundle", "Flavor Fiesta Bundle", "Ultimate Mega Snack Box"],
  gift: ["Ultimate Mega Snack Box", "All Time Favorites", "Choco Lovers Bundle"],
  "tea time": ["Wafer Rolls Hazelnut", "Patata Salty", "Banana Chips Sea Salt"],
  gaming: ["Movie Night Nachos Bundle", "Nachos Salsa", "Patata Masala"],
};

const budgets = {
  under_500: ["Choco Stick Chocolate", "Patata Salty", "Stix Peri Peri", "ChickPea Puffs", "Banana Chips Sea Salt", "Wafer Rolls Hazelnut"],
  under_1000: ["Snaktory Snack Pack", "Nachos Pack Of 10", "Snaktory Patata Chips - Masala & Salty"],
  under_2000: ["All Time Favorites", "Choco Lovers Bundle", "Office Snack Box", "Movie Night Nachos Bundle", "Snack Sampler Deal"],
  above_3000: ["Ultimate Mega Snack Box", "Flavor Fiesta Bundle", "Party Pleaser Bundle", "Crunch Munch Combo"],
};

const intros = [
  "Recommend snacks for",
  "What should I buy for",
  "Best snacks for",
  "Suggest something for",
  "I need snacks for",
];
const tones = ["spicy", "sweet", "salty", "crunchy", "mixed"];
const people = ["kids", "office", "movie night", "party", "gift", "tea time", "gaming"];
const budgetPhrases = [
  "under Rs. 500",
  "under Rs. 1000",
  "under Rs. 2000",
  "above Rs. 3000",
];

function build300TestCases() {
  const cases = [];
  let id = 1;

  const addCase = (query, expected_intent, expected_products = [], notes = "") => {
    cases.push({
      id: `tc-${String(id).padStart(3, "0")}`,
      query,
      expected_intent,
      expected_products,
      notes,
    });
    id += 1;
  };

  addCase("What do you sell?", "what_do_you_sell", ["Snack Sampler Deal"], "brand overview");
  addCase("Recommend something", "product_recommendation", [], "broad discovery");
  addCase("Best seller?", "best_seller_query", ["All Time Favorites"], "should upsell bundle");
  addCase("I am new here", "new_customer_query", ["Snack Sampler Deal"], "first-time shopper");
  addCase("This is expensive", "price_objection", ["All Time Favorites"], "value recovery");
  addCase("Do you have halal certification?", "certification_query", [], "careful compliance answer");
  addCase("Are the snacks halal?", "halal_query", [], "safe halal answer");
  addCase("What are the ingredients in Patata?", "ingredient_query", [], "must not guess");
  addCase("Any allergens in Wafer Rolls?", "allergen_query", [], "must not guess");
  addCase("Do you have COD?", "cod_query", [], "policy");
  addCase("How much is shipping?", "shipping_charges", [], "policy");
  addCase("How long does delivery take?", "delivery_time", [], "policy");
  addCase("Can I pay online?", "payment_query", [], "policy");
  addCase("Can I get a refund?", "refund_query", [], "policy");
  addCase("I got a damaged product", "damaged_product", [], "support escalation");
  addCase("You sent the wrong product", "wrong_product", [], "support escalation");
  addCase("Do you do bulk orders?", "bulk_order_query", ["Party Pleaser Bundle"], "business intent");
  addCase("Corporate gifting options?", "corporate_gifting", ["Ultimate Mega Snack Box"], "business intent");
  addCase("Can you suggest snacks under Rs. 2000?", "budget_recommendation", budgets.under_2000, "budget discovery");
  addCase("Best snacks for movie night?", "movie_night_recommendation", occasionBundles["movie night"], "occasion");

  for (const tone of tones) {
    addCase(`I want ${tone} snacks`, tone === "spicy" ? "spicy_recommendation" : tone === "sweet" ? "sweet_recommendation" : tone === "salty" ? "salty_recommendation" : tone === "crunchy" ? "crunchy_recommendation" : "product_recommendation", tasteBundles[tone] ?? [], "taste intent");
    addCase(`Show me ${tone} options`, tone === "spicy" ? "spicy_recommendation" : tone === "sweet" ? "sweet_recommendation" : tone === "salty" ? "salty_recommendation" : tone === "crunchy" ? "crunchy_recommendation" : "product_recommendation", tasteBundles[tone] ?? [], "taste intent");
    addCase(`Recommend ${tone} snacks`, tone === "spicy" ? "spicy_recommendation" : tone === "sweet" ? "sweet_recommendation" : tone === "salty" ? "salty_recommendation" : tone === "crunchy" ? "crunchy_recommendation" : "product_recommendation", tasteBundles[tone] ?? [], "taste intent");
  }

  for (const person of people) {
    const mappedIntent =
      person === "kids"
        ? "kids_recommendation"
        : person === "office"
          ? "office_recommendation"
          : person === "movie night"
            ? "movie_night_recommendation"
            : person === "party"
              ? "party_recommendation"
              : person === "gift"
                ? "gifting_recommendation"
                : "product_recommendation";
    for (const intro of intros) {
      addCase(`${intro} ${person}`, mappedIntent, occasionBundles[person] ?? [], "occasion phrasing");
    }
  }

  for (const budgetPhrase of budgetPhrases) {
    const key =
      budgetPhrase.includes("500")
        ? "under_500"
        : budgetPhrase.includes("1000")
          ? "under_1000"
          : budgetPhrase.includes("2000")
            ? "under_2000"
            : "above_3000";
    addCase(`Show me snacks ${budgetPhrase}`, "budget_recommendation", budgets[key], "budget intent");
    addCase(`Recommend snacks ${budgetPhrase}`, "budget_recommendation", budgets[key], "budget intent");
    addCase(`Best bundle ${budgetPhrase}`, "budget_recommendation", budgets[key], "budget bundle");
    addCase(`Kuch acha ${budgetPhrase}`, "budget_recommendation", budgets[key], "mixed language");
  }

  const productQueries = [
    ["Stix Hot & Spicy", "spicy_recommendation"],
    ["Stix Peri Peri", "spicy_recommendation"],
    ["Stix Lemon & Chilli", "spicy_recommendation"],
    ["Nachos Salsa", "spicy_recommendation"],
    ["Nachos Paprika", "crunchy_recommendation"],
    ["Patata Masala", "crunchy_recommendation"],
    ["Patata Salty", "salty_recommendation"],
    ["Banana Chips Sea Salt", "salty_recommendation"],
    ["Banana Chips Achari Masti", "spicy_recommendation"],
    ["ChickPea Puffs", "salty_recommendation"],
    ["Choco Stick Chocolate", "sweet_recommendation"],
    ["Choco Stick Strawberry", "sweet_recommendation"],
    ["Coco Choco Can", "sweet_recommendation"],
    ["Wafer Rolls Hazelnut", "sweet_recommendation"],
    ["Wafer Rolls Strawberry", "sweet_recommendation"],
    ["Wafer Rolls Cappuccino", "sweet_recommendation"],
    ["Office Snack Box", "office_recommendation"],
    ["Kids Fun Box", "kids_recommendation"],
    ["Movie Night Nachos Bundle", "movie_night_recommendation"],
    ["Choco Lovers Bundle", "sweet_recommendation"],
  ];

  for (const [name, intent] of productQueries) {
    addCase(`Tell me about ${name}`, intent, [name], "exact product query");
    addCase(`Is ${name} good?`, intent, [name], "exact product query");
    addCase(`Recommend something like ${name}`, intent, [name], "cross-sell query");
    addCase(`What pairs well with ${name}?`, intent, [name], "cross-sell query");
  }

  const romanUrduSeeds = [
    ["Bhai spicy snacks batao", "spicy_recommendation", tasteBundles.spicy],
    ["Kuch meetha chahiye", "sweet_recommendation", tasteBundles.sweet],
    ["Kids ke liye snacks batao", "kids_recommendation", occasionBundles.kids],
    ["Office ke liye bundle batao", "office_recommendation", occasionBundles.office],
    ["Movie night ke liye kya acha hai", "movie_night_recommendation", occasionBundles["movie night"]],
    ["Party ke liye snacks chahiye", "party_recommendation", occasionBundles.party],
    ["Gift dena hai, kya loon", "gifting_recommendation", occasionBundles.gift],
    ["500 ke andar kuch batao", "budget_recommendation", budgets.under_500],
    ["1000 ke andar combos batao", "budget_recommendation", budgets.under_1000],
    ["2000 ke andar bundle batao", "budget_recommendation", budgets.under_2000],
    ["COD hai?", "cod_query", []],
    ["Refund mil sakta hai?", "refund_query", []],
    ["Halal hai?", "halal_query", []],
    ["Ingredients kya hain?", "ingredient_query", []],
    ["Allergy ho to kaunsa safe hai?", "allergen_query", []],
  ];
  for (const [query, intent, products] of romanUrduSeeds) {
    addCase(query, intent, products, "roman urdu");
    addCase(`${query} please`, intent, products, "roman urdu variation");
    addCase(`${query}?`, intent, products, "roman urdu variation");
  }

  const comparisonQueries = [
    "Stix Hot & Spicy vs Stix Peri Peri",
    "Patata Salty vs Banana Chips Sea Salt",
    "Choco Stick Chocolate vs Wafer Rolls Hazelnut",
    "Office Snack Box vs All Time Favorites",
    "Choco Lovers Bundle vs Choco Mania Bundle",
  ];
  for (const query of comparisonQueries) {
    addCase(query, "product_recommendation", [], "comparison needs guided recommendation");
  }

  const trustQueries = [
    "Are you a real brand?",
    "Can I trust Snakitos?",
    "What makes your store different?",
    "Do you have a physical shop?",
    "How can I contact support?",
    "Do you have coupons?",
    "Any discounts running?",
    "Do you offer corporate gifting?",
    "Can I order for an event?",
    "Can you handle a large office order?",
  ];
  for (const query of trustQueries) {
    const intent =
      query.includes("coupon") || query.includes("discount")
        ? "discount_query"
        : query.includes("corporate")
          ? "corporate_gifting"
          : query.includes("event")
            ? "event_order"
            : query.includes("office order")
              ? "bulk_order_query"
              : query.includes("support")
                ? "support_request"
                : "general_brand_query";
    addCase(query, intent, [], "general trust or business");
  }

  while (cases.length < 300) {
    const index = cases.length % productRecords.length;
    const item = productRecords[index];
    const intent = item.taste_tags.includes("sweet")
      ? "sweet_recommendation"
      : item.taste_tags.includes("spicy")
        ? "spicy_recommendation"
        : item.occasion_tags.includes("office")
          ? "office_recommendation"
          : "product_recommendation";
    addCase(`Is ${item.product_name} good for ${item.occasion_tags[0]}?`, intent, [item.product_name], "auto-filled product/occasion coverage");
  }

  return cases.slice(0, 300);
}

const testCases300 = build300TestCases();

const csvHeaders = Object.keys(productRecords[0]);
const productCsv = [
  csvHeaders.join(","),
  ...productRecords.map((record) =>
    csvHeaders
      .map((key) => {
        const value = record[key];
        const rendered = Array.isArray(value) ? JSON.stringify(value) : String(value ?? "");
        return `"${rendered.replaceAll(`"`, `""`)}"`;
      })
      .join(","),
  ),
].join("\n");

async function writeJson(name, data) {
  await fs.writeFile(path.join(outDir, name), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  await writeJson("01-general-query-training-dataset.json", generalQueryTrainingDataset);
  await writeJson("02-product-faq-dataset.json", productFaqDataset);
  await writeJson("03-product-recommendation-dataset.json", productRecommendationDataset);
  await writeJson("04-product-tagging-structure.json", productTaggingStructure);
  await fs.writeFile(path.join(outDir, "05-product-csv-template.csv"), productCsv, "utf8");
  await writeJson("06-faq-json-template.json", faqJsonTemplate);
  await writeJson("07-sales-rule-json-template.json", salesRuleJsonTemplate);
  await writeJson("08-cross-sell-matrix.json", crossSellMatrix);
  await fs.writeFile(path.join(outDir, "09-intent-classifier-prompt.txt"), `${intentClassifierPrompt}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "10-final-chatbot-system-prompt.txt"), `${finalSystemPrompt}\n`, "utf8");
  await writeJson("11-test-cases-300.json", testCases300);
  await writeJson("12-roman-urdu-test-cases.json", romanUrduTestCases);
  await writeJson("13-anti-hallucination-fallback-examples.json", antiHallucinationFallbacks);
  await fs.writeFile(path.join(outDir, "14-weekly-improvement-process.md"), weeklyImprovementProcess, "utf8");
  await writeJson("15-product-records.json", productRecords);

  const readme = `# Snakitos RAG Pack

Generated on demand for the Snakitos Shopify chatbot.

Files:
- 01 general query training dataset
- 02 product FAQ dataset
- 03 product recommendation dataset
- 04 product tagging structure
- 05 product CSV template
- 06 FAQ JSON template
- 07 sales rule JSON template
- 08 cross-sell matrix
- 09 intent classifier prompt
- 10 final chatbot system prompt
- 11 test cases 300
- 12 Roman Urdu test cases
- 13 anti-hallucination fallbacks
- 14 weekly improvement process
- 15 product records

Opening message:
${openingMessage}
`;
  await fs.writeFile(path.join(outDir, "README.md"), readme, "utf8");

  console.log(`Generated Snakitos RAG pack in ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
