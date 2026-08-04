"use client";

import { useState } from "react";
import InfoIcon from "./InfoIcon";

interface Props {
  title: string;
  /** Folded behind an "i" button beside the title. */
  info?: React.ReactNode;
}

/**
 * A panel title, with its explanation tucked behind an "i" button.
 *
 * The note has to render below the whole heading row rather than inside it,
 * so this owns the open state instead of dropping an InfoNote into the row -
 * a note nested in the flex row would lay out beside the title.
 */
export default function PanelHeading({ title, info }: Props) {
  const [open, setOpen] = useState(false);

  if (!info) return <h2>{title}</h2>;

  return (
    <>
      <div className="panel-head">
        <h2>{title}</h2>
        <button
          type="button"
          className={"info-dot" + (open ? " is-open" : "")}
          aria-expanded={open}
          aria-label={open ? `Hide help: ${title}` : `Help: ${title}`}
          onClick={() => setOpen((o) => !o)}
        >
          <InfoIcon />
        </button>
      </div>
      {open && <div className="note info-note">{info}</div>}
    </>
  );
}
