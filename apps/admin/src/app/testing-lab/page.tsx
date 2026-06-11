import { redirect } from "next/navigation";
import { withAdminPath } from "@/lib/constants";

export default function LegacyTestingLabPage() {
  redirect(withAdminPath("/playground"));
}
