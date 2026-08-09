"use client";

import { CheckCircle, InfoOutlined, Spinner } from "./icons";

/**
 * What the import is doing, said with a symbol as well as words.
 *
 * Two things were invisible before. Reading a scanned sheet runs OCR inside
 * the page and takes tens of seconds, with nothing moving to say so - it
 * reads as an app that has frozen. And importing left the panel looking
 * exactly as it had a moment earlier, the button still offering to import,
 * so the one question an operator has afterwards - did that work - was
 * answered only by a line of grey text among other grey text.
 *
 * A symbol carries the state at a glance: a turning ring while it is
 * working, a green tick when it is done, and words either way for anyone who
 * cannot see the difference.
 */

export type SheetState = "idle" | "working" | "done" | "failed";

interface Props {
  state: SheetState;
  children: React.ReactNode;
}

export default function SheetStatus({ state, children }: Props) {
  if (state === "idle" || !children) return null;

  return (
    <div className={"sheet-status sheet-status-" + state} role="status" aria-live="polite">
      <span className="sheet-status-icon">
        {state === "working" ? (
          <Spinner className="mi-spin" />
        ) : state === "done" ? (
          <CheckCircle />
        ) : (
          <InfoOutlined />
        )}
      </span>
      <span>{children}</span>
    </div>
  );
}
