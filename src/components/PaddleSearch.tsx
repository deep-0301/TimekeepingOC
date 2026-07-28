"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isReliefStop,
  loadPaddleBook,
  searchPaddles,
  type Paddle,
  type PaddleBook,
} from "@/lib/paddles";
import { fmtHM, toMin } from "@/lib/dateUtils";

function PaddleCard({ paddle }: { paddle: Paddle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="result-card paddle-card">
      <div className="paddle-card-head">
        <span className="paddle-number">{paddle.p}</span>
        <span className="paddle-routes">
          {paddle.r.length ? `Route ${paddle.r.join(", ")}` : "—"}
        </span>
        {paddle.bus && <span className="badge estimate">{paddle.bus}</span>}
      </div>

      <div className="paddle-signline">
        <span className="paddle-signpoint">
          <span className="paddle-siglabel">Sign on</span>
          <span className="paddle-sigtime">{paddle.on}</span>
          <span className="paddle-sigloc">{paddle.onL}</span>
        </span>
        <span className="day-location-arrow">→</span>
        <span className="paddle-signpoint">
          <span className="paddle-siglabel">Sign off</span>
          <span className="paddle-sigtime">{paddle.off}</span>
          <span className="paddle-sigloc">{paddle.offL}</span>
        </span>
      </div>

      <div className="day-stats" style={{ margin: "4px 0 0" }}>
        Spread <b>{fmtHM(paddle.span)}</b> · {paddle.s.length} stops
        {paddle.s.some(isReliefStop) && (
          <>
            {" "}
            · <span className="badge estimate">has relief</span>
          </>
        )}
      </div>

      <button
        type="button"
        className={"manage-work-toggle" + (open ? " open" : "")}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="manage-work-caret">{open ? "▾" : "▸"}</span>
        {open ? "Hide trips" : "Show all trips"}
      </button>

      {open && (
        <div className="paddle-stops">
          {paddle.s.map((s, i) => (
            <div
              key={i}
              className={"paddle-stop" + (isReliefStop(s) ? " is-relief" : "")}
            >
              <span className="paddle-stop-time">{s[0]}</span>
              <span className="paddle-stop-loc">{s[1]}</span>
              {isReliefStop(s) && (
                <span className="badge estimate">relief</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PaddleSearch() {
  const [query, setQuery] = useState("");
  const [book, setBook] = useState<PaddleBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    loadPaddleBook()
      .then((b) => {
        if (live) {
          setBook(b);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (live) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const { results, truncated } = useMemo(
    () =>
      book ? searchPaddles(book, query) : { results: [], truncated: false },
    [book, query]
  );

  return (
    <section className="panel">
      <h2>Find a paddle</h2>
      <input
        type="text"
        className="run-search"
        placeholder="Type a paddle number, e.g. 005001"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        inputMode="numeric"
      />
      <div className="note">
        {loading
          ? "Loading the paddle book…"
          : error
            ? error
            : book
              ? `${book.paddles.length} ${book.dayType} paddles · effective ${book.effective}. Search by paddle number, or by route number to see every paddle on that route.`
              : ""}
      </div>

      <div className="search-results">
        {query.trim() === "" || !book ? null : results.length === 0 ? (
          <div className="note">
            No paddle or route matches &ldquo;{query.trim()}&rdquo;.
          </div>
        ) : (
          <>
            {results.map((p) => (
              <PaddleCard key={p.p} paddle={p} />
            ))}
            {truncated && (
              <div className="note">
                Showing the first {results.length} matches — type more digits to
                narrow it down.
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Sign-on to sign-off in minutes, for callers that want to price a paddle. */
export function paddleSpanMin(p: Paddle): number {
  const a = toMin(p.on);
  const b = toMin(p.off);
  return b >= a ? b - a : b + 24 * 60 - a;
}
