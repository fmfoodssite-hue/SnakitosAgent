import { FilterBar } from "@/components/dashboard/filter-bar";
import { ChatsTable } from "@/components/dashboard/chats-table";
import { getChatMessages } from "@/lib/admin/data";

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; intent?: string; status?: string }>;
}) {
  const params = await searchParams;
  const rows = await getChatMessages(params);

  return (
    <div className="space-y-6">
      <FilterBar />
      <ChatsTable rows={rows} />
    </div>
  );
}
