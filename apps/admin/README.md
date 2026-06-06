# Snakitos RAG Admin Dashboard

Production-oriented admin dashboard for the Snakitos Shopify AI assistant.

## Modules

- Admin authentication with signed sessions and role checks
- Overview analytics dashboard
- Knowledge base manager
- Upload and ingestion pipeline
- Shopify product sync and reindexing
- Prompt control with version history
- Conversation inbox
- Human handoff ticket manager
- Order tracking and guardrail settings
- Testing lab
- Audit logs

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase
- OpenAI embeddings
- Supabase pgvector or Pinecone
- Shopify Admin API from server routes only

## Folder Structure

```text
apps/admin
├─ src/app
│  ├─ api
│  │  ├─ admin
│  │  │  ├─ analytics
│  │  │  ├─ chats
│  │  │  ├─ handoffs
│  │  │  ├─ knowledge
│  │  │  ├─ prompts
│  │  │  ├─ reindex
│  │  │  ├─ settings
│  │  │  ├─ shopify/sync
│  │  │  ├─ tests
│  │  │  └─ upload
│  │  └─ auth
│  ├─ analytics
│  ├─ audit-logs
│  ├─ conversations
│  ├─ guardrails
│  ├─ handoffs
│  ├─ knowledge-base
│  ├─ prompt-control
│  ├─ settings
│  ├─ shopify-sync
│  ├─ testing-lab
│  └─ uploads
├─ src/components
│  ├─ dashboard
│  ├─ forms
│  └─ ui
├─ src/lib
│  ├─ services
│  ├─ auth.ts
│  ├─ db.ts
│  ├─ env.ts
│  ├─ rate-limit.ts
│  ├─ types.ts
│  └─ validations.ts
└─ supabase
   └─ admin-rag-dashboard.sql
```

## Setup

1. Copy `apps/admin/.env.example` into your environment file.
2. Run the SQL in [supabase/admin-rag-dashboard.sql](./supabase/admin-rag-dashboard.sql).
3. Create a storage bucket matching `UPLOAD_STORAGE_BUCKET`.
4. Install dependencies from `apps/admin/package.json`.
5. Start the app with `npm --prefix apps/admin run dev`.

## Authentication

- Admin users are stored in the `admins` table.
- Sessions are signed with `ADMIN_SESSION_SECRET`.
- A bootstrap owner can be created from `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`.
- Every admin route verifies role access and writes audit logs.

## Upload Ingestion

- Supported file types: `pdf`, `txt`, `csv`, `docx`, `jsonl`
- Files are stored in Supabase Storage
- Extracted content is sanitized, chunked, embedded, and indexed
- Chunk preview and embedding status are visible in the dashboard

## Vector Search

Choose one provider:

- `RAG_VECTOR_PROVIDER=supabase`
- `RAG_VECTOR_PROVIDER=pinecone`

The ingestion service writes metadata in Supabase either way. Reindexing can be triggered from the dashboard or `/api/admin/reindex`.

## Deployment Notes For Vercel

- Deploy `apps/admin` as the project root if you want a dedicated admin deployment.
- If the monorepo is deployed together, keep `basePath=/admin`.
- Add all server-side secrets in the Vercel project settings.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `PINECONE_API_KEY`, or `SHOPIFY_ADMIN_API_ACCESS_TOKEN` to the client.
- Ensure the Vercel runtime has access to the same Supabase project and storage bucket used for ingestion.
- Run the SQL migrations before first login.
- Set `ADMIN_SESSION_SECRET` to a long random value.

