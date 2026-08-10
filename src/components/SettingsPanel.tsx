"use client";

import { useState } from "react";
import type { PaySettings } from "@/lib/types";
import { fmtDate } from "@/lib/dateUtils";
import { describeStep, nextStep, stepOn } from "@/lib/rate";
import PanelHeading from "./PanelHeading";
import { AttachMoney } from "./icons";

interface SettingsPanelProps {
  settings: PaySettings;
  onSave: (next: PaySettings) => void;
}

const PAY_RULES_INFO = (
  <>
        Overtime is only earned on platform/standby time - a paid CLC break
      never counts toward either threshold. Spares earn it day-by-day, once
      that single day&apos;s standby/dispatch hours pass the daily
      threshold. Regular booked work only earns it once the pay period&apos;s
      running total of platform hours passes the biweekly threshold, so
      it&apos;s whichever day&apos;s hours push the period past that line -
      not any single day&apos;s own total.
      <br />
      Sunday premium is applied as the extra portion on top of Regular Pay —
      e.g. 1.25× means Sunday hours are already paid at 1.0× under Regular
      Pay, and this line adds the remaining 0.25×. Overtime is paid in full
      at 1.5× under its own line (those hours are excluded from Regular).
      Stat holiday amounts vary and aren&apos;t fully derivable from a
      single paystub — adjust to match your CBA/paystub if needed.
      <br />
      Give the date you started as an operator and the hourly rate follows
      from it: 85% of the Bus Operator rate for the first eight months, 90%
      from the ninth, 95% from the seventeenth, and the full rate after two
      years. Raises land on the anniversary of that date, part-way through a
      pay period if that is where it falls, and the days either side are paid
      at their own rate. Leave the date empty to keep typing the rate in
      yourself.
  </>
);

export default function SettingsPanel({ settings, onSave }: SettingsPanelProps) {
  const [form, setForm] = useState<PaySettings>(settings);

  const today = fmtDate(new Date());
  const step = stepOn(form.serviceStart, today);
  const derivedRate = step?.rate ?? null;
  const ahead = nextStep(form.serviceStart, today);

  return (
    <section className="panel">
      <PanelHeading
        title="Pay Rules"
        Icon={AttachMoney}
        info={PAY_RULES_INFO}
      />
      <div className="settings-grid">
        <div className="field">
          <label>Started as an operator (after training)</label>
          <input
            type="date"
            value={form.serviceStart ?? ""}
            onChange={(e) =>
              setForm({ ...form, serviceStart: e.target.value || undefined })
            }
          />
        </div>
        <div className="field">
          <label>
            {form.serviceStart ? "Rate today (from that date)" : "Base hourly rate ($)"}
          </label>
          {form.serviceStart ? (
            // Worked out rather than typed: an operator on the way up gets
            // three raises in two years, and a rate typed by hand is wrong
            // from the day one lands until they remember to change it.
            <output className="rate-derived">
              ${derivedRate!.toFixed(3)}
              <span className="rate-derived-note">
                {describeStep(step!)}
                {ahead
                  ? ` · $${ahead.step.rate.toFixed(3)} from ${ahead.date}`
                  : ""}
              </span>
            </output>
          ) : (
            <input
              type="number"
              step="0.001"
              value={form.baseRate}
              onChange={(e) =>
                setForm({ ...form, baseRate: parseFloat(e.target.value) || 0 })
              }
            />
          )}
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
          <label>Daily OT threshold on standby/dispatch hrs (spares)</label>
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
          <label>Biweekly OT threshold on Plat hrs (regular work)</label>
          <input
            type="number"
            step="1"
            value={form.periodOtThreshold}
            onChange={(e) =>
              setForm({
                ...form,
                periodOtThreshold: parseFloat(e.target.value) || 80,
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
        <div className="field">
          <label>Pay period start (any known period-start date)</label>
          <input
            type="date"
            value={form.payPeriodAnchor}
            onChange={(e) =>
              setForm({ ...form, payPeriodAnchor: e.target.value })
            }
          />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => onSave(form)}>Save rules</button>
      </div>
    </section>
  );
}
