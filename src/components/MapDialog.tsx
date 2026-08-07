"use client";

import { useEffect, useRef } from "react";
import { Close } from "./icons";

interface Props {
  title: string;
  lat: number;
  lon: number;
  onClose: () => void;
}

/**
 * The bus on a map, over the page rather than away from it.
 *
 * Opening a map used to hand the operator to another tab, which on a phone
 * means leaving the app and finding their way back to a search they have to
 * type again. Here it is a panel they can shut.
 *
 * The map itself is OpenStreetMap's own embed. A drawable map library would
 * be a dependency, a bundle and a pile of tile requests to answer for, and
 * this needs one marker sitting still - the position only changes when the
 * feed is refreshed anyway.
 */
export default function MapDialog({ title, lat, lon, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // The page behind must not scroll under the map on a phone, where the
    // dialog fills the screen and the scroll would be invisible.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  // A box a couple of streets across, which is the useful scale for "where
  // is it" without having to zoom in from the whole city.
  const dLat = 0.0022;
  const dLon = 0.0042;
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
    .map((n) => n.toFixed(5))
    .join(",");
  const embed =
    `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}` +
    `&layer=mapnik&marker=${lat},${lon}`;
  const full = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;

  return (
    <div
      className="map-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Map showing ${title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="map-dialog">
        <div className="map-dialog-head">
          <span className="map-dialog-title">{title}</span>
          <button
            ref={closeRef}
            type="button"
            className="map-dialog-close"
            onClick={onClose}
            aria-label="Close the map"
          >
            <Close />
          </button>
        </div>

        <iframe
          className="map-frame"
          title={`Map showing ${title}`}
          src={embed}
          loading="lazy"
        />

        <div className="map-dialog-foot">
          <span className="bus-coords">
            {lat.toFixed(5)}, {lon.toFixed(5)}
          </span>
          <a href={full} target="_blank" rel="noreferrer" className="bus-map-link">
            Open full map
          </a>
        </div>
      </div>
    </div>
  );
}
