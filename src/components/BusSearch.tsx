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
  type Paddle,
  type PaddleGuess,
} from "@/lib/paddles";
import {
  clockLabel,
  matchVehicles,
  normalisePaddleNumber,
  paddleWhereAt,
  scheduleMinuteFor,
  type PaddleSegment,
  type PaddleWhere,
  type VehicleMatch,
} from "@/lib/paddleTracking";
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

function minuteOfDay(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** A place on the road, named the way the paddle book names it. */
function Place({ segment }: { segment: PaddleSegment }) {
  if (segment.atStop) {
    return (
      <>
        <b>{segment.from[1]}</b> ({segment.from[0]})
      </>
    );
  }
  return (
    <>
      <b>{segment.from[1]}</b> ({segment.from[0]}) and <b>{segment.to[1]}</b> (
      {segment.to[0]})
    </>
  );
}

/**
 * A paddle, where it is due to be, and the buses that could be working it.
 *
 * The scheduled place comes from the paddle book, which names its timepoints
 * by intersection. The bus comes from the live feed. Those are two different
 * claims and are kept visibly apart: the schedule is certain, the bus is a
 * match, and each match says on what grounds it was made.
 */
function PaddleTrack({
  number,
  paddle,
  where,
  matches,
  now,
}: {
  number: string;
  paddle: Paddle;
  where: PaddleWhere;
  matches: VehicleMatch[];
  now: number;
}) {
  const [showRest, setShowRest] = useState(false);
  const sure = matches.filter((m) => m.confident);
  const rest = matches.filter((m) => !m.confident);

  return (
    <div className="paddle-track">
      <div className="paddle-track-head">
        <span className="paddle-number">{number}</span>
        {where.state === "running" && (
          <>
            <span className="bus-route-badge">{where.segment.route}</span>
            <span className="paddle-track-dest">{where.segment.destination}</span>
          </>
        )}
      </div>

      <div className="note">
        {where.state === "running" ? (
          <>
            Due {where.segment.atStop ? "at" : "between"}{" "}
            <Place segment={where.segment} /> right now.
          </>
        ) : where.state === "layover" ? (
          <>
            Between trips. Next out on route <b>{where.nextRoute}</b> to{" "}
            {where.nextDestination} at {clockLabel(where.nextStart)}.
          </>
        ) : where.state === "before" ? (
          <>This paddle signs on at {clockLabel(where.signOn)}. Nothing on the road yet.</>
        ) : (
          <>Signed off at {clockLabel(where.signOff)}. Nothing left to track.</>
        )}
      </div>

      {where.state === "running" && matches.length === 0 && (
        <div className="note">
          No bus is reporting on route {where.segment.route} at the moment, so
          there is nothing to match this paddle against.
        </div>
      )}

      {sure.map((m) => (
        <Match key={keyOf(m)} match={m} paddle={paddle} where={where} now={now} />
      ))}

      {rest.length > 0 &&
        (sure.length > 0 ? (
          // A named bus is the answer; the rest of the route is a second
          // opinion, and burying it keeps the answer from being crowded out.
          <div className="paddle-others">
            <button
              type="button"
              className="ghost small"
              onClick={() => setShowRest((v) => !v)}
            >
              {showRest ? "Hide" : "Show"} the other {rest.length} bus
              {rest.length === 1 ? "" : "es"} on route {routeOf(where)}
            </button>
            {showRest &&
              rest.map((m) => (
                <Match key={keyOf(m)} match={m} paddle={paddle} where={where} now={now} />
              ))}
          </div>
        ) : (
          <>
            <div className="paddle-match-why">
              These are the buses on route {routeOf(where)} right now. The feed
              does not say which trip each one is on, so pick the one heading
              your way.
            </div>
            {rest.map((m) => (
              <Match
                key={keyOf(m)}
                match={m}
                paddle={paddle}
                where={where}
                now={now}
                quiet
              />
            ))}
          </>
        ))}
    </div>
  );
}

function keyOf(m: VehicleMatch): string {
  return m.vehicle.vehicleId ?? m.vehicle.fleet ?? String(m.vehicle.tripId);
}

function routeOf(where: PaddleWhere): string {
  return where.state === "running" ? where.segment.route : "";
}

/** One candidate bus, with the grounds for the match and where it really is. */
function Match({
  match,
  paddle,
  where,
  now,
  quiet,
}: {
  match: VehicleMatch;
  paddle: Paddle;
  where: PaddleWhere;
  now: number;
  /** The grounds were already given once for the whole group. */
  quiet?: boolean;
}) {
  // Where the bus really is, as opposed to where the timetable puts it: wind
  // the schedule back by however late the feed says it is running.
  const adjusted =
    match.vehicle.delay === undefined
      ? null
      : paddleWhereAt(paddle, scheduleMinuteFor(minuteOfDay(), match.vehicle.delay));
  const moved =
    adjusted?.state === "running" &&
    where.state === "running" &&
    adjusted.segment.from !== where.segment.from;

  return (
    <div className="paddle-match">
      {!quiet && (
        <div className={"paddle-match-why" + (match.confident ? " is-sure" : "")}>
          {match.reason}
        </div>
      )}
      {moved && adjusted?.state === "running" && (
        <div className="note">
          Allowing for how late it is running, it is actually{" "}
          {adjusted.segment.atStop ? "at" : "between"}{" "}
          <Place segment={adjusted.segment} />.
        </div>
      )}
      <VehicleCard vehicle={match.vehicle} now={now} />
    </div>
  );
}

type PaddleView =
  | { kind: "missing"; number: string; dayType: string }
  | { kind: "found"; number: string; paddle: Paddle; where: PaddleWhere };

export default function BusSearch() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");
  const [feed, setFeed] = useState<BusFeed | null>(null);
  const [error, setError] = useState("");
  const [paddleView, setPaddleView] = useState<PaddleView | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // Guards against a slow response for an old query landing after a newer one.
  const seq = useRef(0);

  const load = useCallback(async (q: string) => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      // A paddle number is answered in two steps - the book says which route
      // it is on at this minute, and only then is the feed worth asking.
      const number = normalisePaddleNumber(q);
      if (number) {
        const book = await loadPaddleBookForDate(fmtDate(new Date()));
        if (seq.current !== mine) return;

        const paddle = book.paddles.find((p) => p.p === number);
        if (!paddle) {
          setPaddleView({ kind: "missing", number, dayType: book.dayType });
          setFeed(null);
          setError("");
          return;
        }

        const where = paddleWhereAt(paddle, minuteOfDay());
        setPaddleView({ kind: "found", number, paddle, where });
        if (where.state !== "running") {
          setFeed(null);
          setError("");
          return;
        }

        const data = await fetchBuses(where.segment.route);
        if (seq.current !== mine) return;
        setFeed(data);
        setError("");
        return;
      }

      setPaddleView(null);
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
        info="Live positions from OC Transpo. Type a paddle number (85-02 or 085002) to find the bus working it, the four-digit number on a bus to find that bus, or a route number to see every bus running it."
      />

      <form className="bus-form" onSubmit={submit}>
        <input
          type="text"
          className="bus-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Paddle 85-02, bus 4358, or route 95"
          autoComplete="off"
          maxLength={7}
          aria-label="Paddle number, bus number or route"
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

      {paddleView?.kind === "missing" && (
        <div className="note">
          Paddle {paddleView.number} is not in today&rsquo;s{" "}
          {paddleView.dayType} book. Check the number, or that the paddle
          really runs today.
        </div>
      )}

      {paddleView?.kind === "found" && (
        <PaddleTrack
          number={paddleView.number}
          paddle={paddleView.paddle}
          where={paddleView.where}
          matches={
            paddleView.where.state === "running"
              ? matchVehicles(vehicles, paddleView.where.segment)
              : []
          }
          now={now}
        />
      )}

      {!paddleView && feed && vehicles.length === 0 && !error && (
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

      {/* In paddle mode the cards are rendered by PaddleTrack, each with the
          grounds for its match, so the bare list would only repeat them. */}
      {!paddleView && vehicles.length > 0 && (
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
