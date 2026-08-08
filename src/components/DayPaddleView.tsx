"use client";

import { useState } from "react";
import {
  NoPaddleBookError,
  loadPaddleBookForDate,
  paddleBookForDate,
  type Paddle,
} from "@/lib/paddles";
import { normalisePaddleNumber } from "@/lib/paddleTracking";
import PaddleTimeline from "./PaddleTimeline";
import { ChevronRight, ExpandMore } from "./icons";

/**
 * The paddle behind a day's work, without leaving the day.
 *
 * The calendar knows which runs were worked but only their endpoints - what
 * time they signed on, where they handed over. The paddle book knows the rest
 * of it: every trip, every timepoint, where the relief actually falls. Going
 * to look at it used to mean leaving the calendar for Find a Paddle and
 * typing the number back in from memory.
 *
 * The book is a separate file per season and day type, so it is fetched on
 * demand rather than bundled into every page - a day whose paddle is never
 * opened costs nothing.
 */

interface Props {
  dateStr: string;
  /** Run numbers worked that day, in order, as printed on the board. */
  runs: string[];
}

interface Loaded {
  run: string;
  paddle: Paddle | null;
  error: string | null;
}

export default function DayPaddleView({ dateStr, runs }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // The same paddle worked in two pieces is one paddle, not two.
  const distinct = Array.from(new Set(runs));
  if (distinct.length === 0) return null;

  // Dates outside the seasons we hold a book for have nothing to show, and
  // saying so is better than a button that always fails.
  const ref = paddleBookForDate(dateStr);
  if (!ref) return null;

  async function show(run: string) {
    if (open === run) {
      setOpen(null);
      return;
    }
    setOpen(run);
    if (loaded?.run === run) return;

    setLoading(run);
    try {
      const book = await loadPaddleBookForDate(dateStr);
      const wanted = normalisePaddleNumber(run);
      const paddle =
        book.paddles.find((p) => p.p === wanted) ??
        // The board prints "68-01"; the book zero-pads to "068001". If the
        // padding rule ever differs, fall back to comparing digits alone
        // rather than showing nothing.
        book.paddles.find(
          (p) => p.p.replace(/^0+/, "") === (wanted ?? "").replace(/^0+/, "")
        ) ??
        null;
      setLoaded({
        run,
        paddle,
        error: paddle
          ? null
          : `Paddle ${run} is not in the ${ref!.seasonLabel} ${ref!.dayType} book.`,
      });
    } catch (err) {
      setLoaded({
        run,
        paddle: null,
        error:
          err instanceof NoPaddleBookError
            ? err.message
            : "That paddle book could not be loaded. Check your connection and try again.",
      });
    } finally {
      setLoading(null);
    }
  }

  const showing = open && loaded?.run === open ? loaded : null;

  return (
    <div className="day-paddle">
      <div className="day-paddle-row">
        <span className="day-paddle-label">
          {distinct.length === 1 ? "Paddle" : "Paddles"}
        </span>
        {distinct.map((run) => (
          <button
            key={run}
            type="button"
            className={"ghost small day-paddle-btn" + (open === run ? " is-open" : "")}
            aria-expanded={open === run}
            onClick={() => show(run)}
          >
            {open === run ? <ExpandMore /> : <ChevronRight />}
            {run}
          </button>
        ))}
      </div>

      {open && (
        <div className="day-paddle-body">
          {loading === open && <div className="note">Loading the paddle book…</div>}
          {showing?.error && <div className="note">{showing.error}</div>}
          {showing?.paddle && (
            <>
              <div className="note day-paddle-note">
                {ref.seasonLabel} {ref.dayType} book · signs on{" "}
                <b>{showing.paddle.on}</b> at {showing.paddle.onL} · off{" "}
                <b>{showing.paddle.off}</b> at {showing.paddle.offL}
                {/* A bare trailing "60" reads as a stray number; the book
                    means it as the kind of bus the paddle is assigned. */}
                {showing.paddle.bus && (
                  <span className="shift-tag">{showing.paddle.bus} bus</span>
                )}
              </div>
              <PaddleTimeline paddle={showing.paddle} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
