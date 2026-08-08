"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/dateUtils";
import {
  createPost,
  isApproved,
  myPostFor,
  withdrawPost,
  type ExchangePost,
  type PostKind,
} from "@/lib/exchange";

/**
 * Putting a day on the work exchange, from the day itself.
 *
 * The board's own form asks for a date, a paddle and two times. The calendar
 * already knows all four for the day being looked at, and typing them again
 * is both a chore and a chance to post the wrong shift - so from here it is
 * one button and nothing to fill in.
 *
 * Only days still ahead are offered. A shift that has been worked cannot be
 * given to anyone.
 */

interface Props {
  dateStr: string;
  paddle: string | null;
  onTime: string | null;
  offTime: string | null;
  garage: string | null;
}

type Ready =
  | { state: "loading" }
  /** Nothing to say: no exchange, not approved, or a day in the past. */
  | { state: "hidden" }
  | { state: "ready"; post: ExchangePost | null };

export default function DayExchange({
  dateStr,
  paddle,
  onTime,
  offTime,
  garage,
}: Props) {
  const [ready, setReady] = useState<Ready>({ state: "loading" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Bumped after posting or withdrawing, to read the day's state back rather
  // than assume what the write did.
  const [tick, setTick] = useState(0);

  const past = dateStr < fmtDate(new Date());

  useEffect(() => {
    // A day already worked cannot be given to anyone, so nothing is asked
    // about it. The component renders nothing for those dates either.
    if (past) return;
    let live = true;
    void (async () => {
      try {
        const approved = await isApproved();
        if (!live) return;
        if (!approved) {
          setReady({ state: "hidden" });
          return;
        }
        const post = await myPostFor(dateStr);
        if (!live) return;
        setReady({ state: "ready", post });
      } catch {
        if (!live) return;
        // Any failure to establish that posting would work means not offering
        // it. Buttons that cannot do anything are worse than no buttons, and
        // the board itself is where an exchange problem gets explained - the
        // calendar is not the place to report one.
        setReady({ state: "hidden" });
      }
    })();
    return () => {
      live = false;
    };
  }, [dateStr, past, tick]);

  if (past || ready.state !== "ready") return null;

  const post = async (kind: PostKind) => {
    setBusy(true);
    setError("");
    try {
      await createPost({
        kind,
        workDate: dateStr,
        paddle,
        onTime,
        offTime,
        garage,
        note,
      });
      setNote("");
      setTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pull = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await withdrawPost(id);
      setTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const live = ready.post;

  return (
    <div className="day-xc">
      <div className="day-xc-row">
        <span className="day-xc-label">Work exchange</span>

        {live ? (
          <>
            <span className="badge match">
              {live.kind === "swap" ? "swap posted" : "on the exchange"}
            </span>
            <span className="day-xc-count">
              {live.status === "claimed"
                ? "someone has taken it"
                : live.claimCount === 0
                  ? "no offers yet"
                  : live.claimCount === 1
                    ? "1 offer"
                    : `${live.claimCount} offers`}
            </span>
            <Link className="day-xc-link" href="/exchange">
              Open the board
            </Link>
            {live.status === "open" && (
              <button
                className="ghost small"
                disabled={busy}
                onClick={() => void pull(live.id)}
              >
                Take it off
              </button>
            )}
          </>
        ) : (
          <>
            <button
              className="ghost small"
              disabled={busy}
              onClick={() => void post("give_away")}
            >
              Give this day away
            </button>
            <button
              className="ghost small"
              disabled={busy}
              onClick={() => void post("swap")}
            >
              Offer a swap
            </button>
          </>
        )}
      </div>

      {!live && (
        <div className="day-xc-row">
          <input
            type="text"
            className="day-xc-note"
            placeholder="Note for the board (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      <div className="note day-xc-note-text">
        {live
          ? "Posting is not the trade. Whoever takes it, the exchange still has to go through the employer before you stop showing up."
          : "Posts the date, paddle and times from this day. It arranges the conversation only — the trade still has to go through the employer."}
      </div>

      {error && <div className="note day-xc-error">{error}</div>}
    </div>
  );
}
