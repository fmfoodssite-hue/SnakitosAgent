"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FilterBar() {
  const params = useSearchParams();
  const router = useRouter();

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    router.push(`/admin/chats?${next.toString()}`);
  };

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Input
        type="date"
        defaultValue={params.get("from") ?? ""}
        onChange={(event) => updateParam("from", event.target.value)}
      />
      <Input
        type="date"
        defaultValue={params.get("to") ?? ""}
        onChange={(event) => updateParam("to", event.target.value)}
      />
      <Select defaultValue={params.get("intent") ?? "all"} onValueChange={(value) => updateParam("intent", value)}>
        <SelectTrigger>
          <SelectValue placeholder="Intent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All intents</SelectItem>
          <SelectItem value="product">Product</SelectItem>
          <SelectItem value="order">Order</SelectItem>
          <SelectItem value="general">General</SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue={params.get("status") ?? "all"} onValueChange={(value) => updateParam("status", value)}>
        <SelectTrigger>
          <SelectValue placeholder="Outcome" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All outcomes</SelectItem>
          <SelectItem value="success">Success</SelectItem>
          <SelectItem value="failure">Failure</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
