"use client";

import { useMemo, useState } from "react";
import {
  BOARD_SEGMENTS,
  boardForDate,
  dateMatchesSegment,
  searchRunsInSegment,
  segmentLabel,
  segmentsForDisplay,
  shiftEndpoints,
} from "@/lib/board";
import BookPicker from "./BookPicker";
import { fmtDate, fmtHM, dayLabel, parseDateStr } from "@/lib/dateUtils";

interface RunSearchProps {
  periodDays: Date[];
  onAddShift: (si: number, dateStr: string) => void;
}

export default function RunSearch({ periodDays, onAddShift }: RunSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedDates, setSelectedDates] = useState<Record<number, string>>(
    {}
  );

  // The board the shown period opens on is the usual answer, but the same
  // shift number exists on several boards, so which one is being searched is
  // said outright and can be changed.
  const contextDate = useMemo(
    () => (periodDays.length ? fmtDate(periodDays[0]) : ""),
    [periodDays]
  );
  const defaultSegKey = useMemo(() => {
    const seg = contextDate ? boardForDate(contextDate).segment : null;
    return seg ? `${seg.season}:${seg.dayType}` : "";
  }, [contextDate]);
  const [segKey, setSegKey] = useState("");
  const activeKey = segKey || defaultSegKey;
  const segment = useMemo(
    () =>
      BOARD_SEGMENTS.find((s) => `${s.season}:${s.dayType}` === activeKey) ??
      null,
    [activeKey]
  );

  // Only dates that actually run the chosen board can take its work, so a
  // Saturday shift cannot be dropped onto a Tuesday.
  const dateOptions = useMemo(
    () =>
      periodDays
        .map((d) => fmtDate(d))
        .filter((v) => dateMatchesSegment(v, segment))
        .map((v) => ({ value: v, label: dayLabel(parseDateStr(v)) })),
    [periodDays, segment]
  );

  const { results, truncated } = useMemo(
    () => searchRunsInSegment(query, segment),
    [query, segment]
  );

  return (
    <section className="panel">
      <h2>Add a shift to a date</h2>
      <BookPicker
        legend="Which board?"
        options={segmentsForDisplay().map((s) => ({
          key: `${s.season}:${s.dayType}`,
          label: segmentLabel(s),
          sub: `${s.count} shifts`,
          available: s.count > 0,
        }))}
        value={activeKey}
        onChange={setSegKey}
      />
      <input
        type="text"
        className="run-search"
        placeholder="Type a paddle number, e.g. 68-03"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="note">
        {segment ? (
          <>
            From the <b>{segmentLabel(segment)}</b> pay board — the one that
            adds work to your calendar. Results are grouped by full shift, so
            you can pick the exact combination you actually worked.
          </>
        ) : (
          "This period is outside the booking seasons loaded."
        )}
        {segment && dateOptions.length === 0 && (
          <>
            {" "}
            <b>
              No day in the period shown runs this board, so there is nowhere
              to add it — move to a period that has one.
            </b>
          </>
        )}
      </div>
      <div className="search-results">
        {query.trim() === "" ? null : results.length === 0 ? (
          <div className="note">
            {segment
              ? "No matching paddle number found on that board."
              : "No board is loaded for that date yet."}
          </div>
        ) : (
          <>
            {results.map(({ si, shift, matchedRuns }) => {
              const [, totalPlat, totalPay, runs] = shift;
              const { start, finish } = shiftEndpoints(shift);
              const selectedDate = selectedDates[si] ?? dateOptions[0]?.value ?? "";
              return (
                <div
                  key={si}
                  className="result-card"
                  style={{ flexDirection: "column", alignItems: "stretch" }}
                >
                  <div className="details">
                    <span className="shift-route">
                      {start} &rarr; {finish}
                    </span>{" "}
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
                      disabled={!selectedDate}
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
