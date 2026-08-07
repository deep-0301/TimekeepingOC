"use client";

import { SEASONS, dayTypeLabel, type DayType, type SeasonId } from "@/lib/board";

export interface SeasonDayOption {
  season: SeasonId;
  dayType: DayType;
  /** Shown beside the day, e.g. a shift count or "not loaded". */
  sub?: string;
  available: boolean;
}

interface Props {
  legend: string;
  options: SeasonDayOption[];
  season: SeasonId | null;
  dayType: DayType | null;
  onChange: (season: SeasonId, dayType: DayType) => void;
}

/**
 * Season and day, as two menus rather than one row of every combination.
 *
 * A row of chips grows as the product of the two - six today, ten once the
 * winter books land - and reads as a list of unrelated things when it is
 * really two independent choices. Splitting them keeps the control the same
 * size however many books exist, and matches how an operator thinks about it:
 * which booking, then which kind of day.
 *
 * Both menus always list everything. A book that has not been supplied is
 * shown as such and refuses selection, because a gap the operator can see is
 * far better than a paddle number that appears not to exist.
 */
export default function SeasonDayPicker({
  legend,
  options,
  season,
  dayType,
  onChange,
}: Props) {
  const seasons = SEASONS.filter((s) =>
    options.some((o) => o.season === s.id),
  );
  const days = options.filter((o) => o.season === season);
  const chosen = days.find((o) => o.dayType === dayType) ?? null;

  const pickSeason = (next: SeasonId) => {
    // Keep the day if that season has it, so switching booking does not
    // silently move a Sunday operator onto a weekday.
    const keeps = options.some(
      (o) => o.season === next && o.dayType === dayType && o.available,
    );
    const fallback =
      options.find((o) => o.season === next && o.available)?.dayType ?? dayType;
    onChange(next, keeps && dayType ? dayType : (fallback as DayType));
  };

  return (
    <div className="season-day-picker" role="group" aria-label={legend}>
      <span className="book-picker-legend">{legend}</span>
      <div className="season-day-row">
        <label className="season-day-field">
          <span>Booking</span>
          <select
            value={season ?? ""}
            onChange={(e) => pickSeason(e.target.value as SeasonId)}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="season-day-field">
          <span>Day</span>
          <select
            value={dayType ?? ""}
            onChange={(e) =>
              season && onChange(season, e.target.value as DayType)
            }
          >
            {days.map((o) => (
              <option key={o.dayType} value={o.dayType} disabled={!o.available}>
                {dayTypeLabel(o.dayType)}
                {o.available ? "" : ` — ${o.sub ?? "not loaded"}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Under the row rather than inside the option: a shift count in the
          option text pushes the day name out of a phone-width select. */}
      {chosen?.available && chosen.sub && (
        <div className="season-day-sub">{chosen.sub}</div>
      )}
    </div>
  );
}
