"use client";

import { useMemo, useState } from "react";
import { isReliefStop, type Paddle, type PaddleStop } from "@/lib/paddles";
import { ArrowRightAlt, ChevronRight, ExpandMore } from "./icons";

/**
 * A paddle's whole day, trip by trip.
 *
 * Shared between Find a Paddle and Find a Bus: having identified a bus, an
 * operator wants the same run laid out the same way, not a second rendering
 * of it that has drifted from the first.
 */
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
              {from} <span className="pt-trip-arrow">
                <ArrowRightAlt />
              </span> {to}
            </span>
          )}
          {section.nextDay && <span className="pt-tag pt-tag-next">+1 day</span>}
          {relief && <span className="pt-tag pt-tag-relief">relief</span>}
          <span className="pt-trip-caret">
            {open ? <ExpandMore /> : <ChevronRight />}
          </span>
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

export default function PaddleTimeline({ paddle }: { paddle: Paddle }) {
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
