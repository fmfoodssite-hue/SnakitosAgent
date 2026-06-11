import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-2xl bg-white p-2 text-rose-600">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-rose-950">Something went wrong</h3>
          <p className="mt-1 text-sm text-rose-800">{message}</p>
          {retry ? (
            <Button className="mt-4" onClick={retry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
