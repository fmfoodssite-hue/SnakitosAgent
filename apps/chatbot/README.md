# Snakitos Chatbot

Customer-facing Snakitos ecommerce chatbot built with Next.js. It helps shoppers track orders, find snack deals, browse collections, get product recommendations, and contact support.

## Development

Run from the repository root:

```bash
npm run dev:chatbot
```

Or from this app directory:

```bash
npm run dev
```

## Support Contact

The official Snakitos WhatsApp support number is:

```text
+92-343-6366369
```

Set `SUPPORT_WHATSAPP=+92-343-6366369` in local and deployment environments. The chatbot renders the `WhatsApp Support` button as a direct WhatsApp chat link:

```text
https://wa.me/923436366369
```

If the deployed chatbot shows an old number, check the hosting provider environment variables first because `SUPPORT_WHATSAPP` can override the code fallback.

## Verification

Before deploying chatbot changes, run:

```bash
npm --prefix apps/chatbot run lint
npm --prefix apps/chatbot run build
```
