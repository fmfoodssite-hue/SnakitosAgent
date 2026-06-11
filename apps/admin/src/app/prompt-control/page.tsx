import { redirect } from "next/navigation";
import { withAdminPath } from "@/lib/constants";

export default function LegacyPromptControlPage() {
  redirect(withAdminPath("/prompts"));
}
