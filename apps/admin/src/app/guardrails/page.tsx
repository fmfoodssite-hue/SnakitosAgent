import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { Badge } from "@/components/ui/badge";
import { OFFICIAL_SOCIAL_LINKS } from "@/lib/constants";
import { requirePageAccess } from "@/lib/page-auth";

const blockedClaims = [
  "price",
  "stock",
  "delivery date",
  "refund approval",
  "allergy details",
  "ingredients",
  "certification claims",
  "courier status",
  "payment verification",
  "wholesale rate",
];

export default async function GuardrailsPage() {
  await requirePageAccess(["owner", "admin", "content_manager", "viewer"]);

  return (
    <AdminPage>
      <PageIntro eyebrow="Guardrails" title="Non-negotiable response boundaries" description="The assistant must refuse unsupported claims, rely on RAG-first answers, and escalate whenever data is missing or sensitive." />
      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard title="Blocked Claims">
          <div className="flex flex-wrap gap-2">
            {blockedClaims.map((claim) => (
              <Badge key={claim} tone="danger">{claim}</Badge>
            ))}
          </div>
        </DataCard>
        <DataCard title="Official Social Links">
          <div className="space-y-3 text-sm text-zinc-300">
            <p>Instagram: {OFFICIAL_SOCIAL_LINKS.instagram}</p>
            <p>TikTok: {OFFICIAL_SOCIAL_LINKS.tiktok}</p>
            <p>Facebook: {OFFICIAL_SOCIAL_LINKS.facebook}</p>
            <p>YouTube: {OFFICIAL_SOCIAL_LINKS.youtube}</p>
            <p className="text-zinc-500">{OFFICIAL_SOCIAL_LINKS.otherPlatformMessage}</p>
          </div>
        </DataCard>
      </div>
    </AdminPage>
  );
}

