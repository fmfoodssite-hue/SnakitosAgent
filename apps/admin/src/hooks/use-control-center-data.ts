"use client";

import { useCallback, useEffect, useState } from "react";
import type { ControlCenterSnapshot } from "@/types";

export function useControlCenterData() {
  const [data, setData] = useState<ControlCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/control-center", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
        data?: ControlCenterSnapshot;
        snapshot?: ControlCenterSnapshot;
      };

      const snapshot = payload.snapshot ?? payload.data;

      if (!response.ok || !snapshot) {
        throw new Error(payload.error || "Unable to load control-center data.");
      }

      setData(snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/control-center", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          success?: boolean;
          data?: ControlCenterSnapshot;
          snapshot?: ControlCenterSnapshot;
        };

        const snapshot = payload.snapshot ?? payload.data;

        if (!response.ok || !snapshot) {
          throw new Error(payload.error || "Unable to load control-center data.");
        }

        if (!active) return;
        setData(snapshot);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load dashboard data.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [reload]);

  return { data, loading, error, reload };
}
