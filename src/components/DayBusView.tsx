"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/dateUtils";
import { lookUpPaddleBus } from "@/lib/paddleBus";
import { loadPaddleBookForDate, paddleBookForDate } from "@/lib/paddles";
import { normalisePaddleNumber } from "@/lib/paddleTracking";
import { seenCounts, type BusSighting, type RecordedBus } from "@/lib/types";
import { historyFor, HistoryNotSetUpError, type HistoryByPaddle } from "@/lib/busHistory";

/**
 * Which bus worked this day.
 *
 * The bus number is only knowable while the bus is running: OC Transpo
 * publishes where vehicles are now and nothing about where they were. So it
 * has to be written down at the time or not at all, and there are two things
 * writing it down.
 *
 * This screen is one. Opening today asks the feed and saves what it learns
 * against the day - and asks again on every visit, not only the first, since
 * the feed does not always answer the same way over a day. The sightings are
 * tallied and the bus kept is whichever has worked the paddle most, so one
 * odd reading in the evening does not displace the bus confirmed all morning.
 *
 * The recorder is the other, and it does not need anybody to be looking: it
 * watches the feed all day and keeps one row per run per bus. That is what
 * answers a day this operator never opened - or a run that was somebody
 * else's until they picked it up. A day's own record is preferred where there
 * is one, because it is this operator's app watching their own run; the
 * history stands behind it.
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
  // What the recorder saw on this day, for the days nobody had open.
  const [history, setHistory] = useState<HistoryByPaddle>({});
  const [noHistory, setNoHistory] = useState(false);
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
  // The day's own record first - it is what this operator's app saw, on their
  // own run - and the recorder's history behind it.
  const busFor = (number: string): { fleet: string; note: string } | null => {
    const own = saved?.[number];
    if (own) return { fleet: own.fleet, note: confidence(own) };
    const kept = history[number];
    if (kept) {
      return {
        fleet: kept.fleet,
        note:
          kept.sightings > 1
            ? `from the record · seen ${kept.sightings}×`
            : "from the record · seen once",
      };
    }
    return null;
  };
  const missing = paddles.filter((p) => !busFor(p.number));

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
        // Only a settled trip lookup is written down. Two things have to
        // hold: the feed named a trip this paddle works, and the trip is far
        // enough along to be believed - not in its first five minutes, when
        // the bus finishing the previous trip and the bus starting this one
        // are both sitting at the terminus reporting. This record outlives
        // the day, and a wrong bus number kept for a month is worse than a
        // blank one.
        if (hit.fleet && hit.basis === "trip" && hit.settled) {
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

  // Only today can be answered from the live feed - every other day costs no
  // request at all - but today is asked once per visit even when a bus is
  // already known, so the tally keeps building and the answer settles on the
  // bus that actually worked the run.
  useEffect(() => {
    if (!isToday) return;
    if (asked.current === dateStr) return;
    asked.current = dateStr;
    void look();
  }, [isToday, dateStr, look]);

  // A past day is asked of the record instead. Nothing was written down at
  // the time unless somebody had the day open, but the recorder was watching
  // the feed regardless, so there is usually an answer there.
  useEffect(() => {
    if (isFuture || paddleKey === "") return;
    let live = true;
    historyFor(dateStr, paddleKey.split(","))
      .then((found) => {
        if (live) setHistory(found);
      })
      .catch((err) => {
        if (!live) return;
        setHistory({});
        setNoHistory(err instanceof HistoryNotSetUpError);
      });
    return () => {
      live = false;
    };
  }, [dateStr, paddleKey, isFuture]);

  if (paddles.length === 0) return null;
  if (!paddleBookForDate(dateStr)) return null;

  return (
    <div className="day-bus">
      <div className="day-bus-row">
        <span className="day-bus-label">
          {paddles.length === 1 ? "Bus" : "Buses"}
        </span>
        {paddles.map(({ number, run }) => {
          const bus = busFor(number);
          return (
            <span key={number} className="day-bus-item">
              {bus ? (
                <>
                  <b className="day-bus-fleet">{bus.fleet}</b>
                  {paddles.length > 1 && <span className="shift-tag">{run}</span>}
                  <span className="day-bus-when">{bus.note}</span>
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
            noHistory ? (
              <>
                No bus was written down on this day, and the history that would
                have caught it is not set up yet — run{" "}
                <code>supabase/history.sql</code> and deploy the{" "}
                <code>record-buses</code> function, and every day from then on
                will have an answer whether or not anyone opened it.
              </>
            ) : (
              <>
                Nothing was recorded for this run on this day. A bus can only be
                identified while it is running — OC Transpo publishes where
                vehicles are now, not where they were — so a day before the
                history started watching cannot be recovered.
              </>
            )
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
