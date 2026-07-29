"use client";

import { useMemo, useState } from "react";
import { boardForDate, searchRuns } from "@/lib/board";
import { fmtDate, fmtHM, dayLabel } from "@/lib/dateUtils";

interface RunSearchProps {
  periodDays: Date[];
  onAddShift: (si: number, dateStr: string) => void;
}

export default function RunSearch({ periodDays, onAddShift }: RunSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedDates, setSelectedDates] = useState<Record<number, string>>(
    {}
  );

  const dateOptions = useMemo(
    () => periodDays.map((d) => ({ value: fmtDate(d), label: dayLabel(d) })),
    [periodDays]
  );

  // Results are scoped to the board the shown period runs on, since the
  // same shift number exists on more than one season's board.
  const contextDate = useMemo(
    () => (periodDays.length ? fmtDate(periodDays[0]) : ""),
    [periodDays]
  );
  const board = useMemo(() => boardForDate(contextDate), [contextDate]);
  const { results, truncated } = useMemo(
    () => searchRuns(query, contextDate),
    [query, contextDate]
  );

  return (
    <section className="panel">
      <h2>Add a shift to a date</h2>
      <input
        type="text"
        className="run-search"
        placeholder="Type a paddle number, e.g. 68-03"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="note">
        From the{" "}
        <b>
          {board.season ? board.season.label : "—"} {board.dayType}
        </b>{" "}
        pay board — the one that adds work to your calendar. Results are
        grouped by full shift, so you can pick the exact combination you
        actually worked.
      </div>
      <div className="search-results">
        {query.trim() === "" ? null : results.length === 0 ? (
          <div className="note">
            {board.empty
              ? "No board is loaded for that date yet."
              : "No matching paddle number found in that board."}
          </div>
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
