"use client";

import { useCallback, useEffect, useState } from "react";
import { getSnapshot } from "@/lib/mock-api";
import type { ControlCenterSnapshot } from "@/types";

export function useControlCenterData() {
  const [data, setData] = useState<ControlCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getSnapshot();
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
        const snapshot = await getSnapshot();
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
