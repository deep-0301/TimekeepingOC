"use client";

import { useState } from "react";
import InfoIcon from "./InfoIcon";

interface Props {
  /** Names what the note is about, for screen readers. */
  label: string;
  children: React.ReactNode;
}

/**
 * An explanation folded behind an "i" button.
 *
 * The panels used to open with a paragraph explaining themselves, which is
 * useful once and clutter every day after - on a phone it pushed the controls
 * being explained below the fold. The text is kept, just out of the way until
 * it is asked for.
 */
export default function InfoNote({ label, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={"info-dot" + (open ? " is-open" : "")}
        aria-expanded={open}
        aria-label={open ? `Hide help: ${label}` : `Help: ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <InfoIcon />
      </button>
      {open && <div className="note info-note">{children}</div>}
    </>
  );
}
