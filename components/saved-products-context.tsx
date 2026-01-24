"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SavedProductsContext = createContext<{
  savedIds: string[];
  savedCount: number;
  isLoading: boolean;
  error: string | null;
  toggleSaved: (productId: string) => Promise<void>;
  refresh: () => Promise<void>;
  isSaved: (productId: string) => boolean;
} | null>(null);

export function SavedProductsProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const { data, error: fetchError } = await supabase
      .from("partner_saved_products")
      .select("product_id");

    if (fetchError) {
      setError(fetchError.message);
      setSavedIds([]);
    } else {
      setError(null);
      setSavedIds(data?.map((row) => row.product_id) ?? []);
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    let attempts = 0;

    const load = async () => {
      attempts += 1;
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("partner_saved_products")
        .select("product_id");

      if (!active) return;

      if (fetchError) {
        setError(fetchError.message);
        setSavedIds([]);
        if (fetchError.message.toLowerCase().includes("schema cache") && attempts < 2) {
          setTimeout(() => {
            if (active) {
              void load();
            }
          }, 1200);
        }
      } else {
        setError(null);
        setSavedIds(data?.map((row) => row.product_id) ?? []);
      }

      setIsLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [supabase]);

  const toggleSaved = useCallback(
    async (productId: string) => {
      const isCurrentlySaved = savedIds.includes(productId);
      setSavedIds((prev) =>
        isCurrentlySaved ? prev.filter((id) => id !== productId) : [...prev, productId]
      );

      const { error: mutationError } = isCurrentlySaved
        ? await supabase.from("partner_saved_products").delete().eq("product_id", productId)
        : await supabase.from("partner_saved_products").insert({ product_id: productId });

      if (mutationError) {
        setError(mutationError.message);
        await refresh();
      }
    },
    [savedIds, supabase, refresh]
  );

  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  const value = useMemo(
    () => ({
      savedIds,
      savedCount: savedIds.length,
      isLoading,
      error,
      toggleSaved,
      refresh,
      isSaved: (productId: string) => savedSet.has(productId),
    }),
    [savedIds, isLoading, error, toggleSaved, refresh, savedSet]
  );

  return (
    <SavedProductsContext.Provider value={value}>
      {children}
    </SavedProductsContext.Provider>
  );
}

export function useSavedProducts() {
  const context = useContext(SavedProductsContext);
  if (!context) {
    throw new Error("useSavedProducts must be used within SavedProductsProvider");
  }
  return context;
}
