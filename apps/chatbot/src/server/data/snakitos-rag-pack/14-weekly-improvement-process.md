# Weekly Improvement Process for Snakitos Product and General Queries

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
