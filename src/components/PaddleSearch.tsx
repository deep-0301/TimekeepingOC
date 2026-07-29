"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isReliefStop,
  loadPaddleBook,
  searchPaddles,
  type Paddle,
  type PaddleBook,
  type PaddleStop,
} from "@/lib/paddles";
import { fmtHM } from "@/lib/dateUtils";

function StopRow({
  stop,
  kind,
}: {
  stop: PaddleStop;
  kind?: "on" | "off" | "plain";
}) {
  const relief = isReliefStop(stop);
  return (
    <div
      className={
        "pt-stop" +
        (relief ? " is-relief" : "") +
        (kind === "on" || kind === "off" ? " is-terminal" : "")
      }
    >
      <span className="pt-time">{stop[0]}</span>
      <span className="pt-marker" aria-hidden="true" />
      <span className="pt-loc">
        {stop[1]}
        {relief && <span className="pt-tag pt-tag-relief">relief</span>}
      </span>
    </div>
  );
}

function hm(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function PaddleTimeline({ paddle }: { paddle: Paddle }) {
  // A paddle that runs past midnight restarts its clock at 0:00, so the
  // rollover is called out rather than letting the times look like they
  // jump backwards.
  const sections: React.ReactNode[] = [];
  let prev = -1;
  let rolled = false;

  const push = (
    key: string,
    head: React.ReactNode,
    stops: PaddleStop[],
    lastIsSignOff: boolean
  ) => {
    const rows: React.ReactNode[] = [];
    stops.forEach((s, i) => {
      const v = hm(s[0]);
      if (!rolled && prev >= 0 && v < prev - 180) {
        rolled = true;
        rows.push(
          <div className="pt-midnight" key={`mid-${i}`}>
            next day
          </div>
        );
      }
      prev = v;
      rows.push(
        <StopRow
          key={i}
          stop={s}
          kind={lastIsSignOff && i === stops.length - 1 ? "off" : "plain"}
        />
      );
    });
    sections.push(
      <div className="pt-section" key={key}>
        {head}
        {rows}
      </div>
    );
  };

  push(
    "pre",
    <div className="pt-section-head">
      <span className="pt-badge pt-badge-garage">Sign on</span>
      <span className="pt-section-dest">Pull out of the garage</span>
    </div>,
    paddle.pre,
    false
  );

  paddle.t.forEach(([route, dest, num, stops], ti) => {
    push(
      `t${ti}`,
      <div className="pt-section-head">
        <span className="pt-badge">{route}</span>
        <span className="pt-section-dest">{dest}</span>
        {num != null && <span className="pt-trip-n">trip {num}</span>}
      </div>,
      stops,
      ti === paddle.t.length - 1
    );
  });

  return <div className="pt">{sections}</div>;
}

function PaddleCard({ paddle }: { paddle: Paddle }) {
  const [open, setOpen] = useState(false);
  const stopCount =
    paddle.pre.length + paddle.t.reduce((n, t) => n + t[3].length, 0);
  const hasRelief =
    paddle.pre.some(isReliefStop) ||
    paddle.t.some((t) => t[3].some(isReliefStop));

  return (
    <div className="result-card paddle-card">
      <div className="paddle-card-head">
        <span className="paddle-number">{paddle.p}</span>
        {paddle.r.map((r) => (
          <span className="pt-badge" key={r}>
            {r}
          </span>
        ))}
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
          <span className="paddle-siglabel">
            Sign off{paddle.next ? " (next day)" : ""}
          </span>
          <span className="paddle-sigtime">{paddle.off}</span>
          <span className="paddle-sigloc">{paddle.offL}</span>
        </span>
      </div>

      <div className="day-stats" style={{ margin: "4px 0 0" }}>
        Spread <b>{fmtHM(paddle.span)}</b> · {paddle.t.length} trips ·{" "}
        {stopCount} stops
        {hasRelief && (
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
        {open ? "Hide the run" : "Show the whole run"}
      </button>

      {open && <PaddleTimeline paddle={paddle} />}
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
