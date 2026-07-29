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

interface Section {
  key: string;
  route: string;
  dest: string;
  num: number | null;
  garage: boolean;
  stops: PaddleStop[];
  /** Starts on the day after the paddle signed on. */
  nextDay: boolean;
  lastIsSignOff: boolean;
}

function TripSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const { stops } = section;
  const from = stops.length ? stops[0][0] : null;
  const to = stops.length ? stops[stops.length - 1][0] : null;
  const relief = stops.some(isReliefStop);

  return (
    <div className={"pt-trip" + (open ? " is-open" : "")}>
      <button
        type="button"
        className="pt-trip-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="pt-trip-title">
          <span
            className={"pt-badge" + (section.garage ? " pt-badge-garage" : "")}
          >
            {section.route}
          </span>
          <span className="pt-section-dest">{section.dest}</span>
          {section.num != null && (
            <span className="pt-trip-n">trip {section.num}</span>
          )}
        </span>
        <span className="pt-trip-meta">
          {from && (
            <span className="pt-trip-range">
              {from} <span className="pt-trip-arrow">→</span> {to}
            </span>
          )}
          {section.nextDay && <span className="pt-tag pt-tag-next">+1 day</span>}
          {relief && <span className="pt-tag pt-tag-relief">relief</span>}
          <span className="pt-trip-caret">{open ? "▾" : "▸"}</span>
        </span>
      </button>

      {open && (
        <div className="pt-trip-body">
          {stops.map((s, i) => (
            <StopRow
              key={i}
              stop={s}
              kind={
                section.lastIsSignOff && i === stops.length - 1
                  ? "off"
                  : i === 0 && section.garage
                    ? "on"
                    : "plain"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PaddleTimeline({ paddle }: { paddle: Paddle }) {
  // A paddle can run past midnight, where the printed clock restarts at
  // 0:00. Tracking the rollover lets a trip say which day it belongs to
  // instead of its times looking like they jump backwards.
  const sections = useMemo(() => {
    const out: Section[] = [];
    let prev = -1;
    let dayOffset = 0;

    const add = (
      key: string,
      route: string,
      dest: string,
      num: number | null,
      garage: boolean,
      stops: PaddleStop[],
      lastIsSignOff: boolean
    ) => {
      let startsNextDay = dayOffset > 0;
      stops.forEach((s, i) => {
        const v = hm(s[0]);
        if (prev >= 0 && v < prev - 180) {
          dayOffset += 1;
          if (i === 0) startsNextDay = true;
        }
        prev = v;
      });
      out.push({
        key,
        route,
        dest,
        num,
        garage,
        stops,
        nextDay: startsNextDay,
        lastIsSignOff,
      });
    };

    add("pre", "Sign on", "Pull out of the garage", null, true, paddle.pre, false);
    paddle.t.forEach(([route, dest, num, stops], ti) =>
      add(
        `t${ti}`,
        route,
        dest,
        num,
        false,
        stops,
        ti === paddle.t.length - 1
      )
    );
    return out;
  }, [paddle]);

  return (
    <div className="pt">
      {sections.map((s) => (
        <TripSection key={s.key} section={s} />
      ))}
    </div>
  );
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
        <b>{paddle.t.length}</b> trips · {stopCount} stops
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
