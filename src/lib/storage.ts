import { supabase } from "./supabaseClient";
import { DEFAULT_SETTINGS } from "./types";
import type { EntriesMap, PaySettings } from "./types";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Thin data-access layer, backed by Supabase (one row per signed-in
 * operator in the `app_data` table - see supabase/schema.sql). Requires an
 * authenticated session; callers should sit behind AuthGate so these are
 * never invoked while signed out.
 */
export const store = {
  async loadSettings(): Promise<PaySettings> {
    const uid = await currentUserId();
    if (!uid) return DEFAULT_SETTINGS;
    const { data, error } = await supabase
      .from("app_data")
      .select("settings")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw error;
    return { ...DEFAULT_SETTINGS, ...(data?.settings as object | undefined) };
  },

  async saveSettings(settings: PaySettings): Promise<void> {
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await supabase
      .from("app_data")
      .upsert(
        { user_id: uid, settings, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (error) throw error;
  },

  async loadEntries(): Promise<EntriesMap> {
    const uid = await currentUserId();
    if (!uid) return {};
    const { data, error } = await supabase
      .from("app_data")
      .select("entries")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw error;
    return (data?.entries as EntriesMap) || {};
  },

  async saveEntries(entries: EntriesMap): Promise<void> {
    const uid = await currentUserId();
    if (!uid) return;
    const { error } = await supabase
      .from("app_data")
      .upsert(
        { user_id: uid, entries, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (error) throw error;
  },
};
