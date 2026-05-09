import { SettingsForm } from "@/components/dashboard/settings-form";
import { getBotSettings } from "@/lib/admin/data";

export default async function SettingsPage() {
  const settings = await getBotSettings();
  return <SettingsForm settings={settings} />;
}
