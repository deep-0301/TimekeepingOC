"use client";

import { Fragment, useState } from "react";
import {
  NoPaddleBookError,
  loadPaddleBookForDate,
  paddleBookForDate,
  type Paddle,
  type PaddleBook,
} from "@/lib/paddles";
import { normalisePaddleNumber } from "@/lib/paddleTracking";
import {
  buildSections,
  joinPieces,
  pieceWindow,
  spanLabel,
  windowInPaddle,
  type Section,
  type WorkedPiece,
} from "@/lib/paddleSections";
import { TripSection } from "./PaddleTimeline";
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
 * A split day is two paddles on paper but one day to work, so it is laid out
 * as one: the stretch of the first paddle that was actually driven, the break
 * in the middle, then the stretch of the second. The halves of each paddle
 * somebody else drove are left out - they are not this operator's day.
 *
 * The book is a separate file per season and day type, so it is fetched on
 * demand rather than bundled into every page - a day whose paddle is never
 * opened costs nothing.
 */

interface Props {
  dateStr: string;
  /** The pieces worked that day, in order, as printed on the board. */
  pieces: WorkedPiece[];
}

interface Part {
  key: string;
  run: string;
  from: string;
  to: string;
  fromLoc: string;
  toLoc: string;
  fromMin: number;
  toMin: number;
  sections: Section[];
  error: string | null;
}

interface Loaded {
  key: string;
  parts: Part[];
  error: string | null;
}

/** A paddle from the book, tolerating the board's unpadded numbering. */
function findPaddle(book: PaddleBook, run: string): Paddle | null {
  const wanted = normalisePaddleNumber(run);
  return (
    book.paddles.find((p) => p.p === wanted) ??
    // The board prints "68-01"; the book zero-pads to "068001". If the
    // padding rule ever differs, fall back to comparing digits alone
    // rather than showing nothing.
    book.paddles.find(
      (p) => p.p.replace(/^0+/, "") === (wanted ?? "").replace(/^0+/, "")
    ) ??
    null
  );
}

export default function DayPaddleView({ dateStr, pieces }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const worked = joinPieces(pieces);
  if (worked.length === 0) return null;

  // Dates outside the seasons we hold a book for have nothing to show, and
  // saying so is better than a button that always fails.
  const ref = paddleBookForDate(dateStr);
  if (!ref) return null;

  const key = worked.map((p) => `${p.run}@${p.onTime}-${p.offTime}`).join("|");
  const runs = Array.from(new Set(worked.map((p) => p.run)));

  async function show() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (loaded?.key === key) return;

    setLoading(true);
    try {
      const book = await loadPaddleBookForDate(dateStr);
      // A late day can run its second piece past midnight, where the clock
      // restarts; without carrying the day forward the break between the
      // pieces would measure as negative.
      let prevEnd = -1;
      const parts = worked.map((piece, i) => {
        const paddle = findPaddle(book, piece.run);
        const w = pieceWindow(piece);
        const carry = w.fromMin < prevEnd ? 1440 : 0;
        const fromMin = w.fromMin + carry;
        const toMin = w.toMin + carry;
        prevEnd = toMin;
        return {
          key: `${piece.run}-${i}`,
          run: piece.run,
          from: piece.onTime,
          to: piece.offTime,
          fromLoc: piece.onLoc,
          toLoc: piece.offLoc,
          fromMin,
          toMin,
          sections: paddle
            ? buildSections(paddle, windowInPaddle(paddle, piece))
            : [],
          error: paddle
            ? null
            : `Paddle ${piece.run} is not in the ${ref!.seasonLabel} ${ref!.dayType} book.`,
        };
      });
      setLoaded({ key, parts, error: null });
    } catch (err) {
      setLoaded({
        key,
        parts: [],
        error:
          err instanceof NoPaddleBookError
            ? err.message
            : "That paddle book could not be loaded. Check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  const showing = loaded?.key === key ? loaded : null;

  return (
    <div className="day-paddle">
      <div className="day-paddle-row">
        <span className="day-paddle-label">
          {runs.length === 1 ? "Paddle" : "Paddles"}
        </span>
        <button
          type="button"
          className={"ghost small day-paddle-btn" + (open ? " is-open" : "")}
          aria-expanded={open}
          onClick={show}
        >
          {open ? <ExpandMore /> : <ChevronRight />}
          {runs.join(" + ")}
        </button>
      </div>

      {open && (
        <div className="day-paddle-body">
          {loading && <div className="note">Loading the paddle book…</div>}
          {showing?.error && <div className="note">{showing.error}</div>}
          {showing && !showing.error && (
            <>
              <div className="note day-paddle-note">
                {ref.seasonLabel} {ref.dayType} book · you sign on{" "}
                <b>{showing.parts[0].from}</b> at {showing.parts[0].fromLoc} ·
                off{" "}
                <b>{showing.parts[showing.parts.length - 1].to}</b> at{" "}
                {showing.parts[showing.parts.length - 1].toLoc}
              </div>
              <div className="pt">
                {showing.parts.map((part, i) => {
                  const before = showing.parts[i - 1];
                  return (
                    <Fragment key={part.key}>
                      {before && (
                        <div className="pt-break">
                          <span className="pt-break-label">Break</span>
                          <span className="pt-break-time">
                            {before.to} – {part.from}
                          </span>
                          <span className="pt-break-len">
                            {spanLabel(before.toMin, part.fromMin)}
                          </span>
                        </div>
                      )}
                      {(showing.parts.length > 1 || runs.length > 1) && (
                        <div className="pt-piece">
                          <span className="pt-piece-run">{part.run}</span>
                          <span className="pt-piece-span">
                            {part.from} – {part.to}
                          </span>
                          <span className="pt-piece-loc">
                            {part.fromLoc} → {part.toLoc}
                          </span>
                        </div>
                      )}
                      {part.error && <div className="note">{part.error}</div>}
                      {part.sections.map((s) => (
                        <TripSection key={`${part.key}-${s.key}`} section={s} />
                      ))}
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
