import { redirect } from "next/navigation";
import { withAdminPath } from "@/lib/constants";

export default function LegacyHandoffsPage() {
  redirect(withAdminPath("/tickets"));
}
