"use client";

import { useState, type ComponentType } from "react";
import InfoIcon from "./InfoIcon";

interface Props {
  title: string;
  /** Folded behind an "i" button beside the title. */
  info?: React.ReactNode;
  /**
   * The panel's own symbol, shown before the title.
   *
   * Every screen here is one panel deep, so the symbol is what tells them
   * apart while scrolling - a bus, a calendar, a dollar sign are recognised
   * before the words under them are read.
   */
  Icon?: ComponentType<{ size?: number; className?: string }>;
}

/** The title, with its symbol where one was given. */
function Title({ title, Icon }: Pick<Props, "title" | "Icon">) {
  return (
    <h2>
      {Icon && (
        <span className="panel-icon">
          <Icon />
        </span>
      )}
      {title}
    </h2>
  );
}

/**
 * A panel title, with its explanation tucked behind an "i" button.
 *
 * The note has to render below the whole heading row rather than inside it,
 * so this owns the open state instead of dropping an InfoNote into the row -
 * a note nested in the flex row would lay out beside the title.
 */
export default function PanelHeading({ title, info, Icon }: Props) {
  const [open, setOpen] = useState(false);

  if (!info) return <Title title={title} Icon={Icon} />;

  return (
    <>
      <div className="panel-head">
        <Title title={title} Icon={Icon} />
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
