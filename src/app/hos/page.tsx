"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/lib/AppStateContext";
import { fmtDate, fmtHM, parseDateStr } from "@/lib/dateUtils";
import { HOS_LIMITS, hosRows, hosTotals, type HosCycle } from "@/lib/hos";
import HoursOfServiceTable from "@/components/HoursOfServiceTable";
import WeekNav from "@/components/WeekNav";

const MTO_URL =
  "https://www.ontario.ca/document/official-ministry-transportation-mto-truck-handbook/hours-service";

function Gauge({
  label,
  usedMin,
  limitMin,
  sub,
}: {
  label: string;
  usedMin: number;
  limitMin: number;
  sub: string;
}) {
  const pct = Math.min(100, Math.round((usedMin / limitMin) * 100));
  const left = limitMin - usedMin;
  const state = usedMin > limitMin ? "is-over" : pct >= 85 ? "is-close" : "";
  return (
    <div className="hos-gauge">
      <div className="hos-gauge-label">{label}</div>
      <div className="hos-gauge-value">
        {fmtHM(usedMin)} <span className="hos-gauge-limit">/ {fmtHM(limitMin)}</span>
      </div>
      <span className="hos-bar hos-bar-lg" aria-hidden="true">
        <span className={"hos-bar-fill " + state} style={{ width: `${pct}%` }} />
      </span>
      <div className="hos-gauge-sub">
        {left >= 0 ? `${fmtHM(left)} left` : `${fmtHM(-left)} over`} · {sub}
      </div>
    </div>
  );
}

export default function HosPage() {
  const {
    entries,
    refDate,
    setRefDate,
    periodDays,
    periodLabel,
    currentPeriodValue,
    periodOptions,
  } = useAppState();

  const [cycle, setCycle] = useState<HosCycle>("cycle1");

  const dateStrs = useMemo(() => periodDays.map(fmtDate), [periodDays]);
  const rows = useMemo(
    () => hosRows(dateStrs, entries, cycle),
    [dateStrs, entries, cycle]
  );
  const totals = useMemo(() => hosTotals(rows), [rows]);

  // The cycle position that matters is where it stands on the last day.
  const lastRow = rows[rows.length - 1];
  const cycleUsed = lastRow
    ? cycle === "cycle1"
      ? lastRow.rolling7Min
      : lastRow.rolling14Min
    : 0;
  const cycleLimit =
    cycle === "cycle1" ? HOS_LIMITS.cycle1 : HOS_LIMITS.cycle2;

  const worstDriving = rows.reduce((m, r) => Math.max(m, r.drivingMin), 0);
  const worstOnDuty = rows.reduce((m, r) => Math.max(m, r.onDutyMin), 0);

  return (
    <>
      <WeekNav
        refDate={refDate}
        onPrevWeek={() => {
          const d = new Date(refDate);
          d.setDate(d.getDate() - 14);
          setRefDate(d);
        }}
        onNextWeek={() => {
          const d = new Date(refDate);
          d.setDate(d.getDate() + 14);
          setRefDate(d);
        }}
        onPickDate={(dateStr) => setRefDate(parseDateStr(dateStr))}
      />

      <section className="summary panel">
        <div className="summary-head">
          <h2>Hours of Service ({periodLabel})</h2>
          <select
            className="period-select"
            value={currentPeriodValue}
            onChange={(e) =>
              e.target.value && setRefDate(parseDateStr(e.target.value))
            }
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="day-editor-extras" style={{ marginTop: 0 }}>
          <div className="field">
            <label>Cycle</label>
            <select
              value={cycle}
              onChange={(e) => setCycle(e.target.value as HosCycle)}
            >
              <option value="cycle1">Cycle 1 — 70 h / 7 days</option>
              <option value="cycle2">Cycle 2 — 120 h / 14 days</option>
            </select>
          </div>
        </div>

        <div className="hos-gauges">
          <Gauge
            label={cycle === "cycle1" ? "Cycle 1 on duty" : "Cycle 2 on duty"}
            usedMin={cycleUsed}
            limitMin={cycleLimit}
            sub={
              cycle === "cycle1"
                ? "rolling 7 days to the last day shown"
                : "rolling 14 days to the last day shown"
            }
          />
          <Gauge
            label="Busiest day — driving"
            usedMin={worstDriving}
            limitMin={HOS_LIMITS.dailyDriving}
            sub="13 h daily limit"
          />
          <Gauge
            label="Busiest day — on duty"
            usedMin={worstOnDuty}
            limitMin={HOS_LIMITS.dailyOnDuty}
            sub="14 h daily limit"
          />
        </div>

        <div className="hos-summary-line">
          Driving <b>{fmtHM(totals.drivingMin)}</b> · other on duty{" "}
          <b>{fmtHM(totals.otherOnDutyMin)}</b> · total on duty{" "}
          <b>{fmtHM(totals.onDutyMin)}</b> over {totals.daysWorked} day(s)
          {totals.breachCount > 0 && (
            <>
              {" "}
              ·{" "}
              <span className="badge badge-breach">
                {totals.breachCount} day(s) over a limit
              </span>
            </>
          )}
        </div>

        <HoursOfServiceTable rows={rows} cycle={cycle} />

        {totals.estimatedDays > 0 && (
          <div className="note">
            {totals.estimatedDays} spare day(s) are marked{" "}
            <b>estimated</b> — no outcome was logged, so the guaranteed hours
            stand in for real duty time. Record what happened on those days
            for an accurate figure.
          </div>
        )}
      </section>

      <section className="panel">
        <h2>The limits</h2>
        <div className="hos-rules">
          <div className="hos-rule">
            <span className="hos-rule-n">13 h</span>
            <span className="hos-rule-t">
              Most driving time in a day. A day runs from the start of the
              24-hour period your carrier sets.
            </span>
          </div>
          <div className="hos-rule">
            <span className="hos-rule-n">14 h</span>
            <span className="hos-rule-t">
              Most on-duty time in a day — driving plus everything else you
              are on duty for.
            </span>
          </div>
          <div className="hos-rule">
            <span className="hos-rule-n">16 h</span>
            <span className="hos-rule-t">
              No driving once this much time has elapsed since you came on
              duty, even if you are under 13 driving hours.
            </span>
          </div>
          <div className="hos-rule">
            <span className="hos-rule-n">10 h</span>
            <span className="hos-rule-t">
              Least off-duty time in a day, of which 8 hours must be
              consecutive. The rest can be split into blocks of no less than
              30 minutes.
            </span>
          </div>
          <div className="hos-rule">
            <span className="hos-rule-n">70 h</span>
            <span className="hos-rule-t">
              Cycle 1 — on-duty time in any 7 consecutive days. Reset with 36
              consecutive hours off duty.
            </span>
          </div>
          <div className="hos-rule">
            <span className="hos-rule-n">120 h</span>
            <span className="hos-rule-t">
              Cycle 2 — on-duty time in any 14 consecutive days. Needs 24
              consecutive hours off before passing 70 on-duty hours, and
              resets with 72 consecutive hours off duty.
            </span>
          </div>
        </div>
        <div className="note">
          Limits are from Ontario&apos;s Hours of Service regulation (O. Reg.
          555/06), as set out in the{" "}
          <a href={MTO_URL} target="_blank" rel="noopener noreferrer">
            MTO Truck Handbook
          </a>
          . This page is a planning aid worked out from the days you have
          entered — it is not a log book, and it does not decide whether the
          regulation applies to your work. Check the regulation and your
          collective agreement for what counts as on duty, how your carrier
          sets the 24-hour day, and any exemptions.
        </div>
      </section>
    </>
  );
}
