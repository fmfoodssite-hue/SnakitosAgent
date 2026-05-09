"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BotSettingsRecord } from "@/lib/admin/types";

export function SettingsForm({ settings }: { settings: BotSettingsRecord }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    toast[response.ok ? "success" : "error"](response.ok ? "Settings saved" : "Save failed");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chatbot settings</CardTitle>
        <CardDescription>Adjust voice, fallback behavior, commerce features, and support routing.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Bot name</label>
            <Input value={form.botName} onChange={(event) => setForm({ ...form, botName: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Welcome message</label>
            <Textarea
              value={form.welcomeMessage}
              onChange={(event) => setForm({ ...form, welcomeMessage: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Fallback message</label>
            <Textarea
              value={form.fallbackMessage}
              onChange={(event) => setForm({ ...form, fallbackMessage: event.target.value })}
            />
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Tone</label>
            <Select value={form.tone} onValueChange={(value: "friendly" | "professional") => setForm({ ...form, tone: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-white">Enable order tracking</p>
                <p className="text-sm text-slate-400">Allow authenticated order status responses.</p>
              </div>
              <Switch
                checked={form.enableOrderTracking}
                onCheckedChange={(checked) => setForm({ ...form, enableOrderTracking: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-white">Enable product recommendations</p>
                <p className="text-sm text-slate-400">Show recommended products and commerce nudges.</p>
              </div>
              <Switch
                checked={form.enableProductRecommendations}
                onCheckedChange={(checked) => setForm({ ...form, enableProductRecommendations: checked })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Support email</label>
            <Input
              value={form.supportEmail}
              onChange={(event) => setForm({ ...form, supportEmail: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Support WhatsApp</label>
            <Input
              value={form.supportWhatsapp}
              onChange={(event) => setForm({ ...form, supportWhatsapp: event.target.value })}
            />
          </div>
          <Button disabled={saving} onClick={save}>
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
