"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate, minToHHMM } from "@/lib/dateUtils";
import {
  agoLabel,
  compass,
  delayLabel,
  fetchBusDebug,
  fetchBuses,
  fetchPlace,
  kmh,
  looksLikeFleetNumber,
  occupancyLabel,
  statusLabel,
  type BusFeed,
  type BusPlace,
  type BusVehicle,
} from "@/lib/buses";
import {
  loadPaddleBookForDate,
  paddlesOnRouteAt,
  type Paddle,
  type PaddleGuess,
} from "@/lib/paddles";
import { recallBus, rememberBus, type RememberedBus } from "@/lib/paddleBusMemory";
import {
  bestVehicle,
  clockLabel,
  normalisePaddleNumber,
  paddleWhereAt,
  scheduleMinuteFor,
  type PaddleMatch,
  type PaddleSegment,
  type PaddleWhere,
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

/**
 * The street the bus is actually on, from its coordinates.
 *
 * This is the live position turned into words, as opposed to the paddle's
 * scheduled place. It appears when it arrives and is simply absent when the
 * geocoder cannot answer - the coordinates and the map link are already on
 * the card, so nothing is lost by it failing.
 */
function StreetName({ lat, lon }: { lat: number; lon: number }) {
  // Held with the coordinates it was fetched for, so a bus that moves shows
  // its new street rather than the previous one until the answer lands.
  const [result, setResult] = useState<{
    key: string;
    value: BusPlace | { error: string };
  } | null>(null);

  // Snapped to the same ~11 m grid the edge function caches on, so a bus
  // idling at a stop does not fire a fresh lookup on every refresh.
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;

  useEffect(() => {
    let live = true;
    const [a, b] = key.split(",").map(Number);
    void fetchPlace(a, b).then((value) => {
      if (live) setResult({ key, value });
    });
    return () => {
      live = false;
    };
  }, [key]);

  const place = result && result.key === key ? result.value : null;

  if (!place) return <div className="bus-place is-pending">Finding the street…</div>;

  if ("error" in place) {
    // Shown rather than hidden: a name that silently fails to appear cannot
    // be chased, and the operator can read this out to say what went wrong.
    return (
      <div className="bus-place is-failed">
        Street name unavailable — {place.error}
      </div>
    );
  }

  return (
    <div className="bus-place">
      {place.label}
      <span className="bus-place-credit">© OpenStreetMap contributors</span>
    </div>
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

      {hasPosition && <StreetName lat={vehicle.lat!} lon={vehicle.lon!} />}

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

/**
 * Where the bus is, said the way you would say it out loud.
 *
 * A pair of timepoints with their printed times is a timetable, not a
 * location. How far through the leg the bus is already tells us which end it
 * is nearer, so it can name one place rather than bracketing two.
 */
function Where({ segment }: { segment: PaddleSegment }) {
  const from = <b>{segment.from[1]}</b>;
  const to = <b>{segment.to[1]}</b>;

  if (segment.atStop) return <>At {from}.</>;
  if (segment.progress < 0.35) return <>Just past {from}, heading for {to}.</>;
  if (segment.progress > 0.65) return <>Coming up to {to}.</>;
  return <>On the way from {from} to {to}.</>;
}

/**
 * A paddle, where it is due to be, and the bus working it.
 *
 * The scheduled place comes from the paddle book, which names its timepoints
 * by intersection. The bus comes from the live feed. Those are two different
 * claims and are kept visibly apart: the schedule is certain, the bus is
 * identified, and the page says which it is on.
 *
 * One bus is shown, never a list. Where the feed carries nothing that
 * identifies the trip, no bus is named at all - a wrong bus number is worse
 * than none - and the rest of the route stays behind a link.
 */
function PaddleTrack({
  number,
  paddle,
  where,
  match,
  remembered,
  vehicles,
  now,
}: {
  number: string;
  paddle: Paddle;
  where: PaddleWhere;
  match: PaddleMatch | null;
  remembered?: RememberedBus | null;
  vehicles: BusVehicle[];
  now: number;
}) {
  const [showOthers, setShowOthers] = useState(false);
  const others = match?.others ?? [];
  // Off the road: the bus is looked up by the fleet number written down
  // earlier, so anything that came back is that bus.
  const recalledVehicle =
    where.state !== "running" && remembered
      ? (vehicles.find((v) => v.fleet === remembered.fleet) ?? null)
      : null;

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
            <Where segment={where.segment} />
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

      {/* A paddle between trips is on no route, so the live search has no
          handle on it. The bus identified while it was running does. */}
      {where.state !== "running" && (
        <>
          {!remembered ? (
            <div className="paddle-match-why">
              No bus has been identified for this paddle yet today, and a paddle
              off the road is on no route, so there is nothing to look one up
              by. Search it again while it is running and the bus will be
              remembered for the rest of the day.
            </div>
          ) : recalledVehicle ? (
            <>
              <div className="paddle-match-why is-sure">
                Bus {remembered.fleet} was working this paddle earlier today.
                It is not on a trip right now - this is where it is.
              </div>
              <div className="paddle-match">
                <VehicleCard vehicle={recalledVehicle} now={now} />
              </div>
            </>
          ) : (
            <div className="paddle-match-why is-sure">
              Bus {remembered.fleet} was working this paddle earlier today, and
              is not reporting a position now - buses drop off the feed in the
              garage.
              {remembered.place
                ? ` It was last seen near ${remembered.place} at ${new Date(remembered.at * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
                : ""}
            </div>
          )}
        </>
      )}

      {match && !match.best && others.length === 0 && (
        <div className="note">
          No bus is reporting on route {routeOf(where)} at the moment, so there
          is nothing to match this paddle against.
        </div>
      )}

      {match?.best && (
        <>
          <div className="paddle-match-why is-sure">
            {match.basis === "trip-start"
              ? `Its trip began at ${match.best.startTime}, which is when this paddle's trip was due out.`
              : `The only bus on route ${routeOf(where)} right now.`}
          </div>
          <Match vehicle={match.best} paddle={paddle} where={where} now={now} />
        </>
      )}

      {/* Naming the wrong bus is worse than naming none, so when nothing in
          the feed identifies the trip the answer is withheld rather than
          guessed at. */}
      {match && !match.best && others.length > 0 && (
        <div className="paddle-match-why">
          {others.length} buses are on route {routeOf(where)} right now, and the
          feed does not say which trip any of them is on, so none of them can be
          called yours.
        </div>
      )}

      {others.length > 0 && (
        <div className="paddle-others">
          <button
            type="button"
            className="ghost small"
            onClick={() => setShowOthers((v) => !v)}
          >
            {showOthers ? "Hide" : "Show"} {match?.best ? "the other " : "all "}
            {others.length} bus{others.length === 1 ? "" : "es"} on route{" "}
            {routeOf(where)}
          </button>
          {showOthers &&
            others.map((v) => (
              <Match
                key={v.vehicleId ?? v.fleet ?? String(v.tripId)}
                vehicle={v}
                paddle={paddle}
                where={where}
                now={now}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function routeOf(where: PaddleWhere): string {
  return where.state === "running" ? where.segment.route : "";
}

/** A bus card, preceded by where the paddle's schedule really puts it. */
function Match({
  vehicle,
  paddle,
  where,
  now,
}: {
  vehicle: BusVehicle;
  paddle: Paddle;
  where: PaddleWhere;
  now: number;
}) {
  // Where the bus really is, as opposed to where the timetable puts it: wind
  // the schedule back by however late the feed says it is running.
  const adjusted =
    vehicle.delay === undefined
      ? null
      : paddleWhereAt(paddle, scheduleMinuteFor(minuteOfDay(), vehicle.delay));
  const moved =
    adjusted?.state === "running" &&
    where.state === "running" &&
    adjusted.segment.from !== where.segment.from;

  return (
    <div className="paddle-match">
      {moved && adjusted?.state === "running" && (
        <div className="note">
          Allowing for how late it is running:{" "}
          <Where segment={adjusted.segment} />
        </div>
      )}
      <VehicleCard vehicle={vehicle} now={now} />
    </div>
  );
}

type PaddleView =
  | { kind: "missing"; number: string; dayType: string }
  | {
      kind: "found";
      number: string;
      paddle: Paddle;
      where: PaddleWhere;
      /** Only set when the paddle is off the road and a bus is on record. */
      remembered?: RememberedBus | null;
    };

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

        const today = fmtDate(new Date());
        const where = paddleWhereAt(paddle, minuteOfDay());

        if (where.state === "running") {
          const data = await fetchBuses(where.segment.route);
          if (seq.current !== mine) return;

          // Worth writing down while it is knowable: once the paddle goes on
          // a break it is on no route, and nothing can find the bus again.
          const found = bestVehicle(data.vehicles, where.segment).best;
          if (found?.fleet) {
            rememberBus(number, {
              date: today,
              fleet: found.fleet,
              at: found.ts ?? Math.floor(Date.now() / 1000),
              lat: found.lat,
              lon: found.lon,
              place: where.segment.from[1],
            });
          }

          setPaddleView({ kind: "found", number, paddle, where });
          setFeed(data);
          setError("");
          return;
        }

        // Off the road, so there is no route to ask about. The bus identified
        // earlier today is the only handle left on it.
        const remembered = recallBus(number, today);
        setPaddleView({ kind: "found", number, paddle, where, remembered });
        if (!remembered) {
          setFeed(null);
          setError("");
          return;
        }

        const data = await fetchBuses(remembered.fleet);
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
          match={
            paddleView.where.state === "running"
              ? bestVehicle(vehicles, paddleView.where.segment)
              : null
          }
          remembered={paddleView.remembered}
          vehicles={vehicles}
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
