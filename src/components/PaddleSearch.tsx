"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isReliefStop,
  loadPaddleBookFile,
  paddleBookKeyForDate,
  paddleBookOptions,
  searchPaddles,
  type Paddle,
  type PaddleBook,
} from "@/lib/paddles";
import { fmtDate } from "@/lib/dateUtils";
import type { DayType, SeasonId } from "@/lib/board";
import SeasonDayPicker from "./SeasonDayPicker";
import { readPrefToday, writePrefToday } from "@/lib/uiPrefs";
import { ArrowRightAlt, ChevronRight, ExpandMore } from "./icons";
import PaddleTimeline from "./PaddleTimeline";

const BOOK_PREF = "paddleBook";

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
        <span className="day-location-arrow">
            <ArrowRightAlt />
          </span>
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
        <span className="manage-work-caret">
          {open ? <ExpandMore /> : <ChevronRight />}
        </span>
        {open ? "Hide the run" : "Show the whole run"}
      </button>

      {open && <PaddleTimeline paddle={paddle} />}
    </div>
  );
}

export default function PaddleSearch() {
  const [query, setQuery] = useState("");

  const options = useMemo(() => paddleBookOptions(), []);
  // Today's book by default - the booking the date falls in, and the kind of
  // day it is. A book chosen by hand overrides that, but only for the rest of
  // the day: keeping it for ever means opening on Friday's weekday book on a
  // Saturday, which is wrong in a way that is easy to miss.
  const [bookKey, setBookKey] = useState(() => {
    const saved = readPrefToday(BOOK_PREF, fmtDate(new Date()));
    if (saved && options.some((o) => o.key === saved && o.file)) return saved;
    return (
      paddleBookKeyForDate(fmtDate(new Date())) ??
      options.find((o) => o.file)?.key ??
      ""
    );
  });
  const [season, dayType] = bookKey.split(":") as [SeasonId, DayType];

  const chooseBook = (key: string) => {
    setBookKey(key);
    writePrefToday(BOOK_PREF, fmtDate(new Date()), key);
  };

  // Held with the key it came from, so switching books shows the new book's
  // loading state rather than the previous book's paddles.
  const [loaded, setLoaded] = useState<{
    key: string;
    book?: PaddleBook;
    error?: string;
  } | null>(null);

  const chosen = options.find((o) => o.key === bookKey) ?? null;
  const file = chosen?.file ?? "";
  const current = loaded && loaded.key === bookKey ? loaded : null;
  const book = current?.book ?? null;
  const error = chosen && !chosen.file
    ? `The ${chosen.label} paddle book has not been supplied yet.`
    : (current?.error ?? "");

  useEffect(() => {
    if (!file) return;
    let live = true;
    const key = bookKey;
    loadPaddleBookFile(file)
      .then((b) => {
        if (live) setLoaded({ key, book: b });
      })
      .catch((e: Error) => {
        if (live) setLoaded({ key, error: e.message });
      });
    return () => {
      live = false;
    };
  }, [file, bookKey]);

  const { results, truncated } = useMemo(
    () =>
      book ? searchPaddles(book, query) : { results: [], truncated: false },
    [book, query]
  );

  return (
    <section className="panel">
      <h2>Find a paddle</h2>
      <SeasonDayPicker
        legend="Which paddle book?"
        options={options.map((o) => ({
          season: o.season,
          dayType: o.dayType,
          sub: o.file ? undefined : "not loaded",
          available: !!o.file,
        }))}
        season={season}
        dayType={dayType}
        onChange={(s, d) => chooseBook(`${s}:${d}`)}
      />
      <input
        type="text"
        className="run-search"
        placeholder="Type a paddle number, e.g. 005001"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        inputMode="numeric"
      />
      <div className="note">
        {error
          ? error
          : !book
            ? "Loading the paddle book…"
            : `${book.paddles.length} ${book.dayType} paddles · effective ${book.effective}. Search by paddle number, or by route number to see every paddle on that route.`}
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
