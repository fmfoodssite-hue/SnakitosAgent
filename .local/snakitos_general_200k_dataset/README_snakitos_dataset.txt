Snakitos General Questions Dataset - 200,000 examples

Purpose:
This dataset is designed for chatbot/RAG testing, intent routing, answer generation examples, fallback handling, Roman Urdu handling, and escalation training for the Snakitos AI Assistant.

Files:
1. snakitos_general_200k_train.jsonl
   Recommended for fine-tuning-style supervised examples or retrieval evaluation.
2. snakitos_general_200k_train.csv
   Easier to inspect in Excel/Google Sheets.
3. snakitos_general_sample_500.jsonl
   Small sample for quick testing.
4. README_snakitos_dataset.txt
   This file.

Schema:
- id: stable hash id
- split: train / validation / test
- language: english / roman_urdu
- intent: intent label
- user_message: customer-style query
- ideal_answer: safe approved answer
- requires_escalation: true/false
- tags: searchable labels
- source: source guide
- quality_rule: behavior rule

Important:
- Replace placeholder product availability/prices with live Shopify/RAG data.
- Do not use this dataset to invent exact ingredients, allergens, nutrition facts, stock dates, refund approvals, delivery dates, certificate numbers, or private order details.
- For order tracking, payment deducted, damaged product, wrong product, serious allergy, wholesale pricing, certificate copies, legal/privacy, or angry customer cases, the answer should escalate to human support.
- Roman Urdu examples are included for Pakistani customers.
- This dataset uses templated variations, so for production you should later add real WhatsApp, Instagram, website chat, and support-ticket questions.

Total records: 200000
Intent count: 57
Generated from the Snakitos chatbot guide uploaded in the current conversation.
