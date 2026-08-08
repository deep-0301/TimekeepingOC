"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/dateUtils";
import { lookUpPaddleBus } from "@/lib/paddleBus";
import { loadPaddleBookForDate, paddleBookForDate } from "@/lib/paddles";
import { normalisePaddleNumber } from "@/lib/paddleTracking";
import type { RecordedBus } from "@/lib/types";

/**
 * Which bus worked this day, kept with the day.
 *
 * The bus number is only knowable while the bus is running: OC Transpo
 * publishes where vehicles are now and nothing about where they were, so a
 * bus that was not written down at the time cannot be recovered afterwards
 * at all. An operator wanting to know which bus they had last Tuesday has
 * one chance to find out, and it was last Tuesday.
 *
 * So opening today's day asks the feed and saves what it learns. Every day
 * after that just reads what was saved, and asks nothing.
 */

interface Props {
  dateStr: string;
  /** Run numbers worked that day, as printed on the board. */
  runs: string[];
  saved: Record<string, RecordedBus> | undefined;
  onRecord: (dateStr: string, paddleNumber: string, bus: RecordedBus) => void;
}

type State = "idle" | "looking" | "done" | "failed";

function seenAt(at: number): string {
  const d = new Date(at * 1000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function DayBusView({ dateStr, runs, saved, onRecord }: Props) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  // Which day the automatic look-up has already been spent on, so re-rendering
  // the panel does not keep asking the feed for the same answer.
  const asked = useRef<string | null>(null);

  // A paddle worked in two pieces is one paddle to look up. The run number as
  // the board prints it is kept beside the normalised one, so a label never
  // has to be paired back up by position.
  const paddles: { number: string; run: string }[] = [];
  for (const run of runs) {
    const number = normalisePaddleNumber(run);
    if (number && !paddles.some((p) => p.number === number)) {
      paddles.push({ number, run });
    }
  }
  // Which paddles are on screen, as one value the callback can depend on.
  const paddleKey = paddles.map((p) => p.number).join(",");
  const isToday = dateStr === fmtDate(new Date());
  const missing = paddles.filter((p) => !saved?.[p.number]);

  const look = useCallback(async () => {
    setState("looking");
    setError("");
    try {
      const book = await loadPaddleBookForDate(dateStr);
      const now = new Date();
      const minOfDay = now.getHours() * 60 + now.getMinutes();
      let found = 0;
      for (const { number } of paddles) {
        const paddle = book.paddles.find((p) => p.p === number);
        if (!paddle) continue;
        const hit = await lookUpPaddleBus(number, paddle, minOfDay);
        if (hit.fleet) {
          found++;
          onRecord(dateStr, number, {
            fleet: hit.fleet,
            at: hit.at ?? Math.floor(Date.now() / 1000),
          });
        }
      }
      setState(found > 0 ? "done" : "failed");
    } catch (err) {
      setState("failed");
      setError(err instanceof Error ? err.message : String(err));
    }
    // `numbers` is rebuilt every render from `runs`, so the callback depends
    // on `paddleKey` instead - stable while the same paddles are on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, paddleKey, onRecord]);

  // Only today can be answered, and only what is not already known is worth
  // asking about. Every other day costs no request at all.
  useEffect(() => {
    if (!isToday || missing.length === 0) return;
    if (asked.current === dateStr) return;
    asked.current = dateStr;
    void look();
  }, [isToday, missing.length, dateStr, look]);

  if (paddles.length === 0) return null;
  if (!paddleBookForDate(dateStr)) return null;

  return (
    <div className="day-bus">
      <div className="day-bus-row">
        <span className="day-bus-label">
          {paddles.length === 1 ? "Bus" : "Buses"}
        </span>
        {paddles.map(({ number, run }) => {
          const bus = saved?.[number];
          return (
            <span key={number} className="day-bus-item">
              {bus ? (
                <>
                  <b className="day-bus-fleet">{bus.fleet}</b>
                  {paddles.length > 1 && <span className="shift-tag">{run}</span>}
                  <span className="day-bus-when">seen {seenAt(bus.at)}</span>
                </>
              ) : (
                <span className="day-bus-unknown">
                  {state === "looking"
                    ? "looking…"
                    : isToday
                      ? "not identified yet"
                      : "never recorded"}
                </span>
              )}
            </span>
          );
        })}
        {isToday && (
          <button
            type="button"
            className="ghost small"
            disabled={state === "looking"}
            onClick={() => void look()}
          >
            {state === "looking" ? "Checking…" : "Check now"}
          </button>
        )}
      </div>

      {missing.length > 0 && (
        <div className="note day-bus-note">
          {!isToday ? (
            <>
              A bus can only be identified while it is running — OC Transpo
              publishes where vehicles are now, not where they were. This day
              was not recorded at the time, so it cannot be looked up.
            </>
          ) : state === "failed" && error ? (
            <>The feed could not be reached: {error}</>
          ) : state === "failed" ? (
            <>
              Nothing on this paddle&rsquo;s routes is reporting one of its
              trips right now — usually a layover, or before sign-on. It will
              be found once the bus is back in service.
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
