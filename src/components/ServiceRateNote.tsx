"use client";

import { fmtDate, fmtMoney, parseDateStr } from "@/lib/dateUtils";
import { describeStep, nextStep, stepOn } from "@/lib/rate";
import type { PaySettings } from "@/lib/types";
import { AttachMoney, Schedule } from "./icons";

interface Props {
  settings: PaySettings;
  /** Opens the pay rules, where the date is entered. */
  onOpenRules: () => void;
}

/**
 * Which rate this pay is worked out at, and when it next changes.
 *
 * A new operator is not on the full rate and does not stay on one rate: 85%
 * for eight months, then 90%, then 95%, then the whole thing after two years.
 * Someone checking a pay period against their stub needs to know which of
 * those was applied - and someone who has never told the app when they
 * started needs to be asked, because until they do the figures are only as
 * right as the number they happened to type in.
 */
export default function ServiceRateNote({ settings, onOpenRules }: Props) {
  const today = fmtDate(new Date());
  const step = stepOn(settings.serviceStart, today);

  if (!step) {
    return (
      <div className="rate-note rate-note-ask">
        <span className="rate-note-icon">
          <AttachMoney />
        </span>
        <span>
          Pay is worked out at <b>{fmtMoney(settings.baseRate)}</b>{" "}
          an hour. An operator&rsquo;s rate steps up over their first two years — 85%
          of the Bus Operator rate, then 90%, 95%, and the full rate after two
          years. Tell the app when you started and it will use the right rate
          for every day, including the one a raise lands on.
        </span>
        <button type="button" className="ghost small" onClick={onOpenRules}>
          Add your start date
        </button>
      </div>
    );
  }

  const ahead = nextStep(settings.serviceStart, today);

  return (
    <div className="rate-note">
      <span className="rate-note-icon">
        <AttachMoney />
      </span>
      <span>
        Paid at <b>{fmtMoney(step.rate)}</b> an hour — {describeStep(step)}.
      </span>
      {ahead && (
        <span className="rate-note-next">
          <span className="rate-note-icon">
            <Schedule />
          </span>
          {fmtMoney(ahead.step.rate)} from{" "}
          {parseDateStr(ahead.date).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      )}
    </div>
  );
}
