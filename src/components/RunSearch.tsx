"use client";

import { useMemo, useState } from "react";
import { searchRuns } from "@/lib/board";
import { fmtDate, fmtHM, dayLabel } from "@/lib/dateUtils";

interface RunSearchProps {
  weekDays: Date[];
  onAddShift: (si: number, dateStr: string) => void;
}

export default function RunSearch({ weekDays, onAddShift }: RunSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedDates, setSelectedDates] = useState<Record<number, string>>(
    {}
  );

  const { results, truncated } = useMemo(() => searchRuns(query), [query]);

  const dateOptions = weekDays.map((d) => ({
    value: fmtDate(d),
    label: dayLabel(d),
  }));

  return (
    <section className="panel">
      <h2>Find a run</h2>
      <input
        type="text"
        className="run-search"
        placeholder="Type a run number, e.g. 68-03"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="note">
        From the 2026 Summer Weekday (Daily) Boards. Results are grouped by
        full shift — each card shows every piece paired with that run, so you
        can pick the exact combination you actually worked. (Weekend boards
        aren&apos;t loaded into this tool yet.)
      </div>
      <div className="search-results">
        {query.trim() === "" ? null : results.length === 0 ? (
          <div className="note">No matching run number found in the loaded board.</div>
        ) : (
          <>
            {results.map(({ si, shift, matchedRuns }) => {
              const [shiftId, totalPlat, totalPay, runs] = shift;
              const selectedDate = selectedDates[si] ?? dateOptions[0]?.value ?? "";
              return (
                <div
                  key={si}
                  className="result-card"
                  style={{ flexDirection: "column", alignItems: "stretch" }}
                >
                  <div className="details">
                    <span className="shift-tag">shift {shiftId}</span>{" "}
                    &nbsp; {runs.length} piece(s) &nbsp; total{" "}
                    <b>{fmtHM(totalPlat)}</b> plat / <b>{fmtHM(totalPay)}</b>{" "}
                    pay
                    {runs.map((r, idx) => {
                      const [run, on, off, onloc, offloc, platmin] = r;
                      const highlighted = matchedRuns.has(run);
                      return (
                        <div key={idx}>
                          &bull;{" "}
                          <span
                            style={
                              highlighted
                                ? { color: "var(--steel-dark)", fontWeight: 700 }
                                : undefined
                            }
                          >
                            {run}
                          </span>{" "}
                          &nbsp; {on}&rarr;{off} &nbsp; {onloc} &rarr; {offloc}{" "}
                          &nbsp; {fmtHM(platmin)} plat
                        </div>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      justifyContent: "flex-end",
                      marginTop: 6,
                    }}
                  >
                    <select
                      value={selectedDate}
                      onChange={(e) =>
                        setSelectedDates({
                          ...selectedDates,
                          [si]: e.target.value,
                        })
                      }
                    >
                      {dateOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="small"
                      onClick={() => onAddShift(si, selectedDate)}
                    >
                      + Add whole shift
                    </button>
                  </div>
                </div>
              );
            })}
            {truncated && (
              <div className="note">
                Showing the first 60 matching shift combinations — narrow
                your search for more.
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
