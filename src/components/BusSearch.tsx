"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate, minToHHMM } from "@/lib/dateUtils";
import {
  agoLabel,
  compass,
  delayLabel,
  fetchBusDebug,
  fetchBuses,
  kmh,
  looksLikeFleetNumber,
  occupancyLabel,
  statusLabel,
  type BusFeed,
  type BusVehicle,
} from "@/lib/buses";
import {
  loadPaddleBookForDate,
  paddlesOnRouteAt,
  type PaddleGuess,
} from "@/lib/paddles";
import PanelHeading from "./PanelHeading";

const REFRESH_MS = 15_000;

/**
 * The paddle book has no GTFS trip ids in it, so a bus can only be tied back
 * to a paddle by route and clock. Shown on request rather than by default,
 * partly because it is a guess and partly because the book is 1.6 MB.
 */
function PaddleGuesses({ vehicle }: { vehicle: BusVehicle }) {
  const [guesses, setGuesses] = useState<PaddleGuess[] | null>(null);
  const [error, setError] = useState("");

  const route = vehicle.route;
  const ts = vehicle.ts;

  useEffect(() => {
    if (!route) return;
    let live = true;

    const when = ts ? new Date(ts * 1000) : new Date();
    loadPaddleBookForDate(fmtDate(when))
      .then((book) => {
        if (!live) return;
        setGuesses(
          paddlesOnRouteAt(book, route, when.getHours() * 60 + when.getMinutes()),
        );
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      live = false;
    };
  }, [route, ts]);

  if (error) return <div className="note bus-guess-error">{error}</div>;
  if (guesses === null) return <div className="note">Loading the paddle book…</div>;
  if (guesses.length === 0) {
    return (
      <div className="note">
        No paddle in the book is scheduled on route {route} at this time. The bus
        may be on a trip the book does not cover, or running well off schedule.
      </div>
    );
  }

  return (
    <>
      <div className="note">
        {guesses.length === 1
          ? "One paddle is scheduled on this route right now"
          : `${guesses.length} paddles are scheduled on this route right now`}
        {" — matched on route and time only, so treat it as a shortlist."}
      </div>
      <ul className="bus-guess-list">
        {guesses.map((g) => (
          <li key={`${g.paddle.p}-${g.tripIndex}`}>
            <b className="bus-guess-num">{g.paddle.p}</b>
            <span className="bus-guess-meta">
              to {g.trip[1]} · {minToHHMM(g.startMin % 1440)}–
              {minToHHMM(g.endMin % 1440)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function VehicleCard({ vehicle, now }: { vehicle: BusVehicle; now: number }) {
  const [showPaddles, setShowPaddles] = useState(false);

  const heading = compass(vehicle.bearing);
  const speed = kmh(vehicle.speed);
  const delay = delayLabel(vehicle.delay);
  const status = statusLabel(vehicle.status);
  const occupancy = occupancyLabel(vehicle.occupancy);
  const age = vehicle.ts ? Math.max(0, now / 1000 - vehicle.ts) : null;
  const hasPosition = vehicle.lat !== undefined && vehicle.lon !== undefined;

  return (
    <article className="bus-card">
      <div className="bus-card-head">
        <span className="bus-fleet">
          {vehicle.fleet ?? vehicle.vehicleId ?? "?"}
        </span>
        <span className="bus-card-tags">
          {vehicle.route ? (
            <span className="bus-route-badge">{vehicle.route}</span>
          ) : (
            <span className="bus-route-badge is-idle">not in service</span>
          )}
          {delay && <span className={`bus-delay is-${delay.tone}`}>{delay.text}</span>}
        </span>
      </div>

      <dl className="bus-facts">
        {status && (
          <div>
            <dt>Status</dt>
            <dd>
              {status}
              {vehicle.stopId ? ` stop ${vehicle.stopId}` : ""}
            </dd>
          </div>
        )}
        {speed !== null && (
          <div>
            <dt>Speed</dt>
            <dd>{speed} km/h</dd>
          </div>
        )}
        {heading && (
          <div>
            <dt>Heading</dt>
            <dd>{heading}</dd>
          </div>
        )}
        {occupancy && (
          <div>
            <dt>Load</dt>
            <dd>{occupancy}</dd>
          </div>
        )}
        {vehicle.startTime && (
          <div>
            <dt>Trip began</dt>
            <dd>{vehicle.startTime}</dd>
          </div>
        )}
        <div>
          <dt>Reported</dt>
          <dd>{age === null ? "unknown" : agoLabel(age)}</dd>
        </div>
      </dl>

      {hasPosition && (
        <div className="bus-actions">
          <a
            className="bus-map-link"
            href={`https://www.openstreetmap.org/?mlat=${vehicle.lat}&mlon=${vehicle.lon}#map=17/${vehicle.lat}/${vehicle.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            Open map
          </a>
          {vehicle.route && (
            <button
              type="button"
              className="ghost small"
              onClick={() => setShowPaddles((v) => !v)}
            >
              {showPaddles ? "Hide paddles" : "Which paddle?"}
            </button>
          )}
          <span className="bus-coords">
            {vehicle.lat?.toFixed(5)}, {vehicle.lon?.toFixed(5)}
          </span>
        </div>
      )}

      {showPaddles && (
        <div className="bus-guesses">
          <PaddleGuesses vehicle={vehicle} />
        </div>
      )}
    </article>
  );
}

/**
 * What the feed actually sent, for when nothing at all came back.
 *
 * This lives on the page rather than in a terminal on purpose. Reading the
 * feed's shape is the only way to tell a dead upstream from a parser that
 * disagrees with it about how the JSON is spelled, and the site is the one
 * origin whose content-security policy permits the call.
 */
function FeedDiagnostics() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setResult({ ok: true, text: await fetchBusDebug() });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused on some browsers without a secure
      // context; the text is on screen and can still be selected by hand.
    }
  };

  return (
    <div className="bus-diagnostics">
      {!result ? (
        <button
          type="button"
          className="ghost small"
          onClick={() => void run()}
          disabled={busy}
        >
          {busy ? "Checking…" : "Check what the feed sent"}
        </button>
      ) : (
        <>
          <div className="bus-diagnostics-head">
            <span className="note">
              {result.ok
                ? "Send this to whoever maintains the app."
                : "Could not read the feed."}
            </span>
            {result.ok && (
              <button type="button" className="ghost small" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          <pre className="bus-diagnostics-body">{result.text}</pre>
        </>
      )}
    </div>
  );
}

export default function BusSearch() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");
  const [feed, setFeed] = useState<BusFeed | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // Guards against a slow response for an old query landing after a newer one.
  const seq = useRef(0);

  const load = useCallback(async (q: string) => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const data = await fetchBuses(q);
      if (seq.current !== mine) return;
      setFeed(data);
      setError("");
    } catch (err) {
      if (seq.current !== mine) return;
      setError(err instanceof Error ? err.message : String(err));
      setFeed(null);
    } finally {
      if (seq.current === mine) setLoading(false);
    }
  }, []);

  // Keeps "reported 20s ago" honest between refreshes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!auto || !active) return;
    const id = setInterval(() => void load(active), REFRESH_MS);
    return () => clearInterval(id);
  }, [auto, active, load]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setActive(q);
    void load(q);
  };

  const vehicles = feed?.vehicles ?? [];
  const searchedFor = feed?.query ?? "";

  return (
    <section className="panel">
      <PanelHeading
        title="Find a bus"
        info="Live positions from OC Transpo. Type the four-digit number on the bus, or a route number to see every bus running it."
      />

      <form className="bus-form" onSubmit={submit}>
        <input
          type="text"
          className="bus-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bus number, e.g. 4358"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          aria-label="Bus number or route"
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Looking…" : "Search"}
        </button>
      </form>

      {active && (
        <div className="bus-toolbar">
          <label className="bus-auto">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Refresh every 15s
          </label>
          <button
            type="button"
            className="ghost small"
            onClick={() => void load(active)}
            disabled={loading}
          >
            Refresh now
          </button>
          {feed && <span className="bus-total">{feed.total} buses in service</span>}
        </div>
      )}

      {error && <div className="note bus-error">{error}</div>}

      {feed && vehicles.length === 0 && !error && (
        <div className="note">
          {/* No buses at all system-wide is a broken feed, not a quiet
              network - saying "4710 is not reporting" there sends you
              looking for the wrong problem. */}
          {feed.total === 0
            ? "The feed returned no buses at all, which should never happen while service is running. The vehicle feed is likely down or being read wrongly - it is not just this bus."
            : looksLikeFleetNumber(searchedFor)
              ? `Bus ${searchedFor} is not reporting a position right now. Buses drop off the feed when they are in the garage, out of service, or between trips.`
              : `Nothing is running route ${searchedFor} at the moment.`}
        </div>
      )}

      {/* Only worth offering when the whole feed came back empty, which is
          the one failure the message above cannot explain on its own. */}
      {feed && feed.total === 0 && !error && <FeedDiagnostics />}

      {vehicles.length > 0 && (
        <>
          {feed?.kind === "route" && (
            <div className="note">
              {vehicles.length} bus{vehicles.length === 1 ? "" : "es"} on route{" "}
              {searchedFor}
            </div>
          )}
          <div className="bus-results">
            {vehicles.map((v) => (
              <VehicleCard
                key={v.vehicleId ?? v.fleet ?? String(v.tripId)}
                vehicle={v}
                now={now}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
