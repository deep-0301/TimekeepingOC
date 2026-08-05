"use client";

import { useRef, useState, type ComponentType } from "react";
import {
  hmToMin,
  parseBookingSheetText,
  type SheetBlock,
} from "@/lib/bookingSheetParser";
import { matchBoardShift } from "@/lib/board";
import { BOOKING_TYPE_INFO, DEFAULT_SLOTS, type BookingType } from "@/lib/bookingType";
import { fmtDate, fmtHM, parseDateStr } from "@/lib/dateUtils";
import { extractPdfText } from "@/lib/pdfExtract";
import { newEmptyDayEntry, type EntriesMap, type EntryPiece } from "@/lib/types";
import HolidaySpareImport from "./HolidaySpareImport";
import type { SheetRow } from "@/lib/bookingSheetParser";
import InfoNote from "./InfoNote";
import { Description, FileUpload } from "./icons";

/** When a block's totals line wasn't captured (e.g. an OCR line-break
 * merged it into a row, dropping it), fall back to summing each row's own
 * duration instead of leaving the whole block/day unimported. */
function fallbackTotalMin(rows: SheetRow[]): number {
  return rows.reduce((a, r) => a + hmToMin(r.segPlat || r.totalGuarantee), 0);
}

function isValidHM(s: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(s.trim());
}

interface BookingSheetImportProps {
  onImport: (updater: (prev: EntriesMap) => EntriesMap) => void;
  onSeasonAnchorDetected: (dateStr: string) => void;
  bookingType?: BookingType | null;
}

export default function BookingSheetImport({
  onImport,
  onSeasonAnchorDetected,
  bookingType,
}: BookingSheetImportProps) {
  const slots = bookingType ? BOOKING_TYPE_INFO[bookingType].slots : DEFAULT_SLOTS;

  if (bookingType === "holiday") {
    const statSlot = slots[1];
    return (
      <section className="panel">
        <h2>Import your booking sheets</h2>
        <div className="sheet-import-grid">
          <HolidaySpareImport onImport={onImport} />
          <BookingSheetSlot
            title={statSlot.title}
            Icon={statSlot.Icon}
            accent={statSlot.accent}
            onImport={onImport}
            onSeasonAnchorDetected={onSeasonAnchorDetected}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Import your booking sheets</h2>
      <div className="sheet-import-grid">
        {slots.map((slot) => (
          <BookingSheetSlot
            key={slot.key}
            title={slot.title}
            Icon={slot.Icon}
            accent={slot.accent}
            onImport={onImport}
            onSeasonAnchorDetected={onSeasonAnchorDetected}
          />
        ))}
      </div>
    </section>
  );
}

interface BookingSheetSlotProps extends BookingSheetImportProps {
  title: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  accent: "steel" | "amber";
}

function BookingSheetSlot({
  title,
  Icon,
  accent,
  onImport,
  onSeasonAnchorDetected,
}: BookingSheetSlotProps) {
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [blocks, setBlocks] = useState<SheetBlock[]>([]);
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [rowDatesList, setRowDatesList] = useState<Record<number, string[]>>(
    {}
  );
  const [totalOverrides, setTotalOverrides] = useState<
    Record<number, { plat: string; pay: string }>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  function runParse(text: string) {
    if (!text.trim()) {
      setParseStatus("Paste some text first.");
      return;
    }
    const { anchorDate, seasonEndDate, blocks: parsedBlocks } =
      parseBookingSheetText(text, null);
    if (anchorDate) {
      onSeasonAnchorDetected(fmtDate(anchorDate));
    }
    const dateRangeNote =
      anchorDate && seasonEndDate
        ? ` Runs ${fmtDate(anchorDate)} to ${fmtDate(seasonEndDate)} — repeating patterns are applied to every matching week through then.`
        : "";
    setParseStatus(`${parsedBlocks.length} block(s) found.${dateRangeNote}`);

    const workBlocks = parsedBlocks.filter(
      (b) => b.isDayOff || b.rows.length > 0
    );
    setBlocks(workBlocks);
    const inc: Record<number, boolean> = {};
    const dates: Record<number, string[]> = {};
    workBlocks.forEach((b, i) => {
      inc[i] = true;
      dates[i] = b.dates.map(fmtDate);
    });
    setIncluded(inc);
    setRowDatesList(dates);
    setTotalOverrides({});
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setParseStatus("Reading file…");
    try {
      let text: string;
      if (/\.pdf$/i.test(file.name)) {
        text = await extractPdfText(file, (msg) => setParseStatus(msg));
      } else if (/\.txt$/i.test(file.name)) {
        text = await file.text();
      } else {
        setParseStatus("Please choose a .pdf or .txt file.");
        return;
      }
      setPasteText(text);
      setParseStatus("File read — parsing…");
      runParse(text);
    } catch (err) {
      console.error(err);
      setParseStatus(
        "Could not read that PDF automatically — try opening it and pasting the text instead."
      );
    }
  }

  function handleBaseDateChange(i: number, newBaseDateStr: string) {
    const current = rowDatesList[i] || [];
    if (current.length === 0 || !newBaseDateStr) {
      setRowDatesList({ ...rowDatesList, [i]: [newBaseDateStr] });
      return;
    }
    const oldBase = parseDateStr(current[0]);
    const newBase = parseDateStr(newBaseDateStr);
    const deltaDays = Math.round(
      (newBase.getTime() - oldBase.getTime()) / 86400000
    );
    const shifted = current.map((ds) => {
      const d = parseDateStr(ds);
      d.setDate(d.getDate() + deltaDays);
      return fmtDate(d);
    });
    setRowDatesList({ ...rowDatesList, [i]: shifted });
  }

  function handleImport() {
    let count = 0;
    onImport((prev) => {
      const next = { ...prev };
      blocks.forEach((b, i) => {
        if (!included[i]) return;
        const dateStrs = rowDatesList[i] || [];
        const hasTotals = !!(b.totalPlat && b.totalPay);
        const anySpare = b.rows.some((r) => r.isSpare);
        const hasRowDurations =
          b.rows.length > 0 && b.rows.every((r) => r.segPlat || r.totalGuarantee);
        const useDriving = hasTotals || (!anySpare && hasRowDurations);
        dateStrs.forEach((dateStr) => {
          if (!dateStr) return;
          const day = next[dateStr] ? { ...next[dateStr] } : newEmptyDayEntry();
          if (b.isDayOff) {
            day.dayOff = true;
            day.pieces = [];
            next[dateStr] = day;
            count++;
            return;
          }
          if (useDriving) {
            const override = totalOverrides[i];
            const sumMin = fallbackTotalMin(b.rows);
            // The board is the schedule the sheet's figures describe, so when
            // the runs identify a whole shift on the board that date runs, its
            // plat and pay are used in place of whatever the sheet printed.
            // The sheet's own totals stay the fallback for work the board does
            // not cover - a relief part-way through a shift, a sheet from a
            // board that has not been loaded, an unreadable scan.
            const match = matchBoardShift(
              b.rows.map((r) => ({
                run: r.run,
                onTime: r.onTime,
                offTime: r.offTime,
              })),
              b.rows[0]?.shiftCode ?? null,
              dateStr
            );
            const boardShift = match && match.complete ? match.shift : null;

            const platMin = boardShift
              ? boardShift[1]
              : hasTotals
              ? hmToMin(b.totalPlat)
              : override && isValidHM(override.plat)
              ? hmToMin(override.plat)
              : sumMin;
            const payMin = boardShift
              ? boardShift[2]
              : hasTotals
              ? hmToMin(b.totalPay)
              : override && isValidHM(override.pay)
              ? hmToMin(override.pay)
              : sumMin;
            const boardRuns = boardShift
              ? boardShift[3].map((r) => r[0])
              : null;
            day.pieces = b.rows.map(
              (r): EntryPiece => ({
                run: r.run,
                shiftId: boardShift ? boardShift[0] : r.shiftCode,
                onTime: r.onTime,
                offTime: r.offTime,
                onLoc: r.onLoc,
                offLoc: r.offLoc,
                platMin: hmToMin(r.segPlat || r.totalGuarantee),
                shiftPlat: boardShift ? boardShift[1] : 0,
                shiftPay: boardShift ? boardShift[2] : 0,
                shiftIndex: match ? match.si : null,
                allRuns: boardRuns ?? b.rows.map((rr) => rr.run),
              })
            );
            day.fromSheet = true;
            day.sheetPlat = platMin;
            day.sheetPay = payMin;
            day.fromBoard = boardShift ? true : undefined;
          } else if (anySpare) {
            const totalMin = b.rows.reduce(
              (a, r) => a + hmToMin(r.totalGuarantee),
              0
            );
            const guaranteeHrs = totalMin / 60;
            const spareRow = b.rows.find((r) => r.isSpare) || b.rows[0];
            const garage = spareRow?.offLoc
              ? spareRow.offLoc.replace(/\(?\s*spare\s*\)?/gi, "").trim()
              : "";
            day.spare = {
              guaranteeHrs,
              runNumber: null,
              startMin: spareRow ? hmToMin(spareRow.onTime) : undefined,
              garage: garage || undefined,
            };
          }
          if (b.isHoliday) day.isStat = true;
          next[dateStr] = day;
          count++;
        });
      });
      return next;
    });
    setParseStatus(`Imported ${count} day(s).`);
  }

  return (
    <div className={"sheet-import-slot sheet-import-slot-" + accent}>
      <h3>
        <span className="sheet-import-icon">
          <Icon />
        </span>
        {title}
      </h3>

      <div
        className={
          "dropzone" +
          (isDragging ? " dropzone-active" : "") +
          (fileName ? " dropzone-has-file" : "")
        }
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {fileName ? (
          <>
            <div className="dropzone-icon">
              <Description />
            </div>
            <div className="dropzone-filename">{fileName}</div>
            <div className="dropzone-hint">Click or drop to replace</div>
          </>
        ) : (
          <>
            <div className="dropzone-icon">
              <FileUpload />
            </div>
            <div className="dropzone-title">
              Drag &amp; drop your PDF here
            </div>
            <div className="dropzone-hint">or click to browse</div>
          </>
        )}
      </div>

      <textarea
        className="sheet-paste"
        rows={5}
        placeholder="…or paste this sheet's text here"
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
      />
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        <button onClick={() => runParse(pasteText)}>Parse</button>
      </div>
      {parseStatus && (
        <div className="note" style={{ marginTop: 6 }}>
          {parseStatus}
        </div>
      )}

      {blocks.length === 0 ? null : (
        <>
          <InfoNote label="Reviewing what was parsed">
            Review below, uncheck anything you don&apos;t want, fix the first
            date if it looks off (the rest of that pattern&apos;s dates shift
            with it), then import.
          </InfoNote>
          <table className="summary-table" style={{ marginTop: 6 }}>
            <tbody>
              {blocks.map((b, i) => {
                const hasTotals = !!(b.totalPlat && b.totalPay);
                const anySpare = b.rows.some((r) => r.isSpare);
                const hasRowDurations =
                  b.rows.length > 0 &&
                  b.rows.every((r) => r.segPlat || r.totalGuarantee);
                const useDriving = hasTotals || (!anySpare && hasRowDurations);
                const kind = b.isDayOff
                  ? "Day off"
                  : useDriving
                  ? "Driving day"
                  : anySpare
                  ? "Spare / standby"
                  : "Unclear — check manually";
                const runsDesc = b.rows.map((r) => r.run).join(" + ");
                const firstDate = (rowDatesList[i] || [])[0] || "";
                // Previewed against the pattern's first date, since that is
                // the board the whole pattern will be matched against unless
                // it straddles a season change.
                const match =
                  useDriving && !b.isDayOff && firstDate
                    ? matchBoardShift(
                        b.rows.map((r) => ({
                          run: r.run,
                          onTime: r.onTime,
                          offTime: r.offTime,
                        })),
                        b.rows[0]?.shiftCode ?? null,
                        firstDate
                      )
                    : null;
                const boardShift = match && match.complete ? match.shift : null;
                const sheetDisagrees =
                  boardShift &&
                  hasTotals &&
                  (hmToMin(b.totalPlat) !== boardShift[1] ||
                    hmToMin(b.totalPay) !== boardShift[2]);
                let hoursDesc = "";
                if (b.isDayOff) hoursDesc = "";
                else if (useDriving)
                  hoursDesc = boardShift
                    ? `Plat ${fmtHM(boardShift[1])} / Pay ${fmtHM(boardShift[2])} — from the board, shift ${boardShift[0]}` +
                      (sheetDisagrees
                        ? ` (sheet prints ${b.totalPlat} / ${b.totalPay})`
                        : "")
                    : hasTotals
                    ? `Plat ${b.totalPlat} / Pay ${b.totalPay} — as printed, no board match`
                    : `Plat/Pay ${fmtHM(fallbackTotalMin(b.rows))} (estimated - no totals line found)`;
                else if (anySpare) {
                  const totalMin = b.rows.reduce(
                    (a, r) => a + hmToMin(r.totalGuarantee),
                    0
                  );
                  hoursDesc = `${fmtHM(totalMin)} standby`;
                }
                const dates = rowDatesList[i] || [];
                return (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <input
                        type="checkbox"
                        checked={!!included[i]}
                        onChange={(e) =>
                          setIncluded({ ...included, [i]: e.target.checked })
                        }
                      />
                      <input
                        type="date"
                        style={{ width: 135 }}
                        value={dates[0] || ""}
                        onChange={(e) => handleBaseDateChange(i, e.target.value)}
                      />
                    </td>
                    <td>
                      <b>{b.label}</b>
                      {b.isHoliday && (
                        <span className="badge estimate">holiday</span>
                      )}{" "}
                      — {kind}
                      <br />
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11.5px",
                          color: "var(--ink-soft)",
                        }}
                      >
                        {runsDesc} &nbsp; {hoursDesc}
                      </span>
                      {useDriving && !hasTotals && (
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            marginTop: 4,
                          }}
                        >
                          <span className="note" style={{ margin: 0 }}>
                            Check against your sheet:
                          </span>
                          <input
                            type="text"
                            placeholder="Plat H:MM"
                            style={{ width: 80 }}
                            value={
                              totalOverrides[i]?.plat ??
                              fmtHM(fallbackTotalMin(b.rows))
                            }
                            onChange={(e) =>
                              setTotalOverrides({
                                ...totalOverrides,
                                [i]: {
                                  plat: e.target.value,
                                  pay:
                                    totalOverrides[i]?.pay ??
                                    fmtHM(fallbackTotalMin(b.rows)),
                                },
                              })
                            }
                          />
                          <input
                            type="text"
                            placeholder="Pay H:MM"
                            style={{ width: 80 }}
                            value={
                              totalOverrides[i]?.pay ??
                              fmtHM(fallbackTotalMin(b.rows))
                            }
                            onChange={(e) =>
                              setTotalOverrides({
                                ...totalOverrides,
                                [i]: {
                                  plat:
                                    totalOverrides[i]?.plat ??
                                    fmtHM(fallbackTotalMin(b.rows)),
                                  pay: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      )}
                      {dates.length > 1 && (
                        <div className="note" style={{ margin: "2px 0 0" }}>
                          Repeats {dates.length}×: {dates.join(", ")}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <button onClick={handleImport}>Import checked rows</button>
          </div>
        </>
      )}
    </div>
  );
}
