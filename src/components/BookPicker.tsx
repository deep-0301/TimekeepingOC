"use client";

export interface PickerOption {
  key: string;
  label: string;
  /** Shown under the label, e.g. a shift count or "not loaded". */
  sub?: string;
  /** False greys the button out and refuses selection. */
  available: boolean;
}

interface Props {
  legend: string;
  options: PickerOption[];
  value: string | null;
  onChange: (key: string) => void;
}

/**
 * A row of buttons naming which board or paddle book is being searched.
 *
 * Books and boards used to be picked implicitly from a date, which left the
 * operator guessing which set of work they were looking at - and the same
 * shift number exists on several boards, so guessing wrong is quiet and
 * wrong rather than obviously wrong. Unavailable options are shown rather
 * than hidden, so a missing book reads as missing instead of as a bad
 * paddle number.
 */
export default function BookPicker({ legend, options, value, onChange }: Props) {
  return (
    <div className="book-picker" role="group" aria-label={legend}>
      <span className="book-picker-legend">{legend}</span>
      <div className="book-picker-row">
        {options.map((o) => {
          const active = o.key === value;
          return (
            <button
              key={o.key}
              type="button"
              className={
                "book-chip" +
                (active ? " is-active" : "") +
                (o.available ? "" : " is-missing")
              }
              aria-pressed={active}
              disabled={!o.available}
              title={o.available ? o.label : `${o.label} — not loaded yet`}
              onClick={() => onChange(o.key)}
            >
              <span className="book-chip-label">{o.label}</span>
              {o.sub && <span className="book-chip-sub">{o.sub}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
