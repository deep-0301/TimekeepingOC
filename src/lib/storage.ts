import { DEFAULT_SETTINGS } from "./types";
import type { EntriesMap, PaySettings } from "./types";

const SETTINGS_KEY = "timekeepingoc:settings";
const ENTRIES_KEY = "timekeepingoc:entries";

/**
 * Thin data-access layer. Backed by localStorage today so the app runs
 * as a static export (e.g. GitHub Pages). Swap the bodies of these
 * functions for real API calls to move to a server-backed database
 * without touching any UI code.
 */
export const store = {
  async loadSettings(): Promise<PaySettings> {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: PaySettings): Promise<void> {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  async loadEntries(): Promise<EntriesMap> {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(ENTRIES_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  },

  async saveEntries(entries: EntriesMap): Promise<void> {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  },
};
