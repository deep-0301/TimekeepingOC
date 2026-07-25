"use client";

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i);

/** Always-24-hour clock-style time entry: separate hour/minute dropdowns
 * instead of typed text or a native <input type="time"> (whose displayed
 * format - 12h/AM-PM vs 24h - follows the visitor's own browser locale and
 * can't be reliably forced from the page). */
export default function TimeField24({
  label,
  valueMin,
  minAllowed,
  onCommit,
}: {
  label: string;
  valueMin: number | undefined;
  minAllowed?: number;
  onCommit: (min: number) => void;
}) {
  const hasValue = valueMin != null && valueMin > 0;
  const h = hasValue ? Math.floor(valueMin / 60) : "";
  const mi = hasValue ? valueMin % 60 : "";

  function commit(newH: number, newMi: number) {
    let mins = newH * 60 + newMi;
    if (minAllowed != null) mins = Math.max(mins, minAllowed);
    onCommit(mins);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="time24">
        <span className="time24-icon">🕐</span>
        <select
          aria-label={`${label} hour`}
          value={h}
          onChange={(e) => commit(parseInt(e.target.value, 10), mi === "" ? 0 : mi)}
        >
          <option value="" disabled>
            HH
          </option>
          {HOURS_24.map((hh) => (
            <option key={hh} value={hh}>
              {String(hh).padStart(2, "0")}
            </option>
          ))}
        </select>
        <span className="time24-colon">:</span>
        <select
          aria-label={`${label} minute`}
          value={mi}
          onChange={(e) => commit(h === "" ? 0 : h, parseInt(e.target.value, 10))}
        >
          <option value="" disabled>
            MM
          </option>
          {MINUTES_60.map((mm) => (
            <option key={mm} value={mm}>
              {String(mm).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
