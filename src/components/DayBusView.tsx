"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/dateUtils";
import { lookUpPaddleBus } from "@/lib/paddleBus";
import { loadPaddleBookForDate, paddleBookForDate } from "@/lib/paddles";
import { normalisePaddleNumber } from "@/lib/paddleTracking";
import { seenCounts, type BusSighting, type RecordedBus } from "@/lib/types";

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
 *
 * Today is asked again on every visit, not only the first. The feed does not
 * always answer the same way over a day - a bus swapped out mid-run, or one
 * bad match near a layover - so the sightings are tallied and the bus kept is
 * whichever has worked the paddle most. One odd reading in the evening does
 * not displace the bus confirmed all morning.
 */

interface Props {
  dateStr: string;
  /** Run numbers worked that day, as printed on the board. */
  runs: string[];
  saved: Record<string, RecordedBus> | undefined;
  onRecord: (dateStr: string, paddleNumber: string, sighting: BusSighting) => void;
}

type State = "idle" | "looking" | "done" | "failed";

function seenAt(at: number): string {
  const d = new Date(at * 1000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * How settled the answer is, in words rather than a number nobody asked for.
 *
 * Only worth saying when the feed has disagreed with itself. While every
 * sighting has named the same bus there is nothing to qualify, and "3 of 3"
 * would only invite doubt where there is none.
 */
function confidence(bus: RecordedBus): string {
  const counts = seenCounts(bus);
  const mine = counts[bus.fleet] ?? 1;
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const when = `seen ${seenAt(bus.at)}`;
  return all > mine ? `${when} · ${mine} of ${all} sightings` : when;
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
  const today = fmtDate(new Date());
  const isToday = dateStr === today;
  // A day still ahead has no bus yet, which is a different thing from a past
  // day whose bus was never written down. Saying "not recorded at the time"
  // about next Tuesday is simply untrue.
  const isFuture = dateStr > today;
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
        // Only a trip lookup is written down. A bus picked out because its
        // trip started at the right minute is worth showing live beside the
        // reason for it, but this record outlives the day and is what an
        // operator will trust in a month - so it is kept for the answers that
        // cannot be a coincidence.
        if (hit.fleet && hit.basis === "trip") {
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

  // Only today can be answered - every other day costs no request at all -
  // but today is asked once per visit even when a bus is already known, so
  // the tally keeps building and the answer settles on the bus that actually
  // worked the run.
  useEffect(() => {
    if (!isToday) return;
    if (asked.current === dateStr) return;
    asked.current = dateStr;
    void look();
  }, [isToday, dateStr, look]);

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
                  <span className="day-bus-when">{confidence(bus)}</span>
                </>
              ) : (
                <span className="day-bus-unknown">
                  {state === "looking"
                    ? "looking…"
                    : isToday
                      ? "not identified yet"
                      : isFuture
                        ? "not assigned yet"
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
          {isFuture ? (
            <>
              Buses are assigned on the day. Open this day once it comes round
              and the bus working this paddle will be found and kept here.
            </>
          ) : !isToday ? (
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
