"use client";

import { useState } from "react";
import type { PaySettings } from "@/lib/types";

interface SettingsPanelProps {
  settings: PaySettings;
  onSave: (next: PaySettings) => void;
}

export default function SettingsPanel({ settings, onSave }: SettingsPanelProps) {
  const [form, setForm] = useState<PaySettings>(settings);

  return (
    <section className="panel">
      <h2>Pay Rules</h2>
      <div className="settings-grid">
        <div className="field">
          <label>Base hourly rate ($)</label>
          <input
            type="number"
            step="0.001"
            value={form.baseRate}
            onChange={(e) =>
              setForm({ ...form, baseRate: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
        <div className="field">
          <label>Overtime multiplier (×)</label>
          <input
            type="number"
            step="0.05"
            value={form.otMultiplier}
            onChange={(e) =>
              setForm({
                ...form,
                otMultiplier: parseFloat(e.target.value) || 1.5,
              })
            }
          />
        </div>
        <div className="field">
          <label>Daily OT threshold on Pay hrs</label>
          <input
            type="number"
            step="0.25"
            value={form.otThreshold}
            onChange={(e) =>
              setForm({
                ...form,
                otThreshold: parseFloat(e.target.value) || 8,
              })
            }
          />
        </div>
        <div className="field">
          <label>Sunday premium (× base pay, e.g. 1.25)</label>
          <input
            type="number"
            step="0.01"
            value={form.sundayMultiplier}
            onChange={(e) =>
              setForm({
                ...form,
                sundayMultiplier: parseFloat(e.target.value) || 1.25,
              })
            }
          />
        </div>
        <div className="field">
          <label>Stat holiday pay ($/day, editable)</label>
          <input
            type="number"
            step="1"
            value={form.statHolidayPay}
            onChange={(e) =>
              setForm({
                ...form,
                statHolidayPay: parseFloat(e.target.value) || 0,
              })
            }
          />
        </div>
        <div className="field">
          <label>Week starts on</label>
          <select
            value={form.weekStart}
            onChange={(e) =>
              setForm({
                ...form,
                weekStart: e.target.value as "sunday" | "monday",
              })
            }
          >
            <option value="sunday">Sunday</option>
            <option value="monday">Monday</option>
          </select>
        </div>
      </div>
      <div className="note">
        Sunday premium is applied as the extra portion on top of Regular Pay —
        e.g. 1.25× means Sunday hours are already paid at 1.0× under Regular
        Pay, and this line adds the remaining 0.25×. Overtime is paid in full
        at 1.5× under its own line (those hours are excluded from Regular).
        Stat holiday amounts vary and aren&apos;t fully derivable from a
        single paystub — adjust to match your CBA/paystub if needed.
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => onSave(form)}>Save rules</button>
      </div>
    </section>
  );
}
