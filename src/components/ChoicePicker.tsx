"use client";

import type { ComponentType } from "react";

/**
 * A short list of choices, shown as the choices themselves.
 *
 * A dropdown hides every option but one. That is the right trade for a long
 * list, and the wrong one for three: it costs a tap to see what is on offer,
 * gives no sense of what a day can be until it is opened, and on a phone hands
 * the whole question to the operating system's picker wheel. These are two or
 * three options that fit on one line, so they are simply on the line.
 *
 * Each carries its own symbol. A bus, a sofa, an hourglass are read at a
 * glance and in any light, which matters for something used one-handed at a
 * garage door - the word underneath is there to settle what the symbol means,
 * not to be read every time.
 */

export interface Choice<T extends string> {
  value: T;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  /** Said aloud by a screen reader where the label alone is too terse. */
  hint?: string;
}

interface Props<T extends string> {
  /** What is being chosen. Rendered as the group's label. */
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}

export default function ChoicePicker<T extends string>({
  label,
  value,
  choices,
  onChange,
}: Props<T>) {
  return (
    <div className="field choice-field">
      <span className="choice-label" id={`choice-${label.replace(/\W+/g, "-")}`}>
        {label}
      </span>
      <div
        className="choice-picker"
        role="radiogroup"
        aria-labelledby={`choice-${label.replace(/\W+/g, "-")}`}
      >
        {choices.map(({ value: v, label: text, Icon, hint }) => {
          const on = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={hint ?? text}
              className={"choice" + (on ? " is-on" : "")}
              onClick={() => onChange(v)}
            >
              <span className="choice-icon">
                <Icon />
              </span>
              <span className="choice-text">{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
