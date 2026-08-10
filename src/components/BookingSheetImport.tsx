"use client";

import { useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  hmToMin,
  parseBookingSheetText,
  type SheetBlock,
} from "@/lib/bookingSheetParser";
import { matchBoardShift } from "@/lib/board";
import { fmtDate, fmtHM, parseDateStr } from "@/lib/dateUtils";
import { describeSheet, detectSheet, type Detected } from "@/lib/sheetKind";
import { extractPdfText } from "@/lib/pdfExtract";
import { newEmptyDayEntry, type EntriesMap, type EntryPiece } from "@/lib/types";
import HolidaySpareImport from "./HolidaySpareImport";
import type { SheetRow } from "@/lib/bookingSheetParser";
import InfoNote from "./InfoNote";
import { CheckCircle, CloudUpload, Description, FileUpload, Spinner } from "./icons";
import SheetStatus, { type SheetState } from "./SheetStatus";

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
}

/** One sheet that has been read and recognised, awaiting review. */
interface LoadedSheet {
  id: number;
  name: string;
  text: string;
  found: Detected;
  /** Days that went into the calendar, once it has been imported. */
  imported?: number;
}

/**
 * One place to put a booking sheet, whatever booking it is for.
 *
 * The app used to ask which booking the operator held and then offer one or
 * two labelled boxes to match. That put the question the wrong way round: the
 * sheet already knows what it is, and an operator who picked the wrong answer
 * got boxes that did not fit what they had. Now anything can be dropped here
 * - one file or several - and each is recognised on its own.
 */
export default function BookingSheetImport({
  onImport,
  onSeasonAnchorDetected,
}: BookingSheetImportProps) {
  const [sheets, setSheets] = useState<LoadedSheet[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [status, setStatus] = useState("");
  const [state, setState] = useState<SheetState>("idle");
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const nextId = useRef(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function add(name: string, text: string) {
    const found = detectSheet(text);
    if (found.kind === "unrecognised") {
      setState("failed");
      setStatus(
        `${name}: not recognised as a booking sheet. If it is a scan, the ` +
          "text may not have come through - try pasting it instead.",
      );
      return false;
    }
    setSheets((prev) => [...prev, { id: nextId.current++, name, text, found }]);
    return true;
  }

  function markImported(id: number, count: number) {
    const after = sheets.map((sheet) =>
      sheet.id === id ? { ...sheet, imported: count } : sheet,
    );
    setSheets(after);
    setState("done");

    // The days are in the calendar, so that is where to be: seeing them on
    // the dates they landed on is a better confirmation than any number here.
    //
    // Unless something is still waiting. Leaving for the calendar with a
    // second sheet unimported would strand it behind a page change nobody
    // asked for, so those stay put and the panel says how many are left.
    const waiting = after.filter((sheet) => !sheet.imported).length;
    if (waiting === 0) {
      setStatus(
        `Imported — ${count} day${count === 1 ? "" : "s"} added. Opening your calendar…`,
      );
      router.push("/");
      return;
    }
    setStatus(
      `Imported — ${count} day${count === 1 ? "" : "s"} added to your calendar. ` +
        `${waiting} more sheet${waiting === 1 ? "" : "s"} still to import.`,
    );
  }

  async function readFiles(files: File[]) {
    let done = 0;
    setState("working");
    for (const file of files) {
      setStatus(`Reading ${file.name}…`);
      try {
        let text: string;
        if (/\.pdf$/i.test(file.name)) {
          text = await extractPdfText(file, (msg) => setStatus(`${file.name}: ${msg}`));
        } else if (/\.txt$/i.test(file.name)) {
          text = await file.text();
        } else {
          setState("failed");
          setStatus(`${file.name}: please choose a .pdf or .txt file.`);
          continue;
        }
        if (add(file.name, text)) done++;
      } catch (err) {
        console.error(err);
        setState("failed");
        setStatus(
          `${file.name}: could not be read automatically — try opening it ` +
            "and pasting the text instead.",
        );
      }
    }
    if (done > 0) {
      setState("done");
      setStatus(
        done === 1
          ? "Sheet read — check it below, then import."
          : `${done} sheets read — check them below, then import.`,
      );
    } else {
      // Nothing was added, so whatever went wrong is still the news.
      setState((prev) => (prev === "working" ? "failed" : prev));
    }
  }

  return (
    <section className="panel">
      <h2><span className="panel-icon"><CloudUpload /></span>Import your booking sheets</h2>
      <div className="note" style={{ marginTop: -4, marginBottom: 10 }}>
        Drop any booking sheet here — daily, general, or holiday spare. Add as
        many as you have; each one is recognised on its own, so there is
        nothing to choose first.
      </div>

      <div
        className={
          "dropzone" +
          (isDragging ? " dropzone-active" : "") +
          (state === "working" ? " dropzone-working" : "")
        }
        onClick={() => fileInputRef.current?.click()}
        aria-busy={state === "working"}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void readFiles(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          multiple
          className="hidden"
          onChange={(e) => void readFiles(Array.from(e.target.files ?? []))}
        />
        <div className="dropzone-icon">
          {state === "working" ? <Spinner className="mi-spin" /> : <FileUpload />}
        </div>
        <div className="dropzone-title">
          {state === "working" ? "Reading…" : "Drop your booking sheets here"}
        </div>
        <div className="dropzone-hint">
          {state === "working"
            ? "A scanned sheet is read in the page and can take a minute"
            : "PDF or text, one or several — or click to browse"}
        </div>
      </div>

      <textarea
        className="sheet-paste"
        rows={5}
        placeholder="…or paste a sheet's text here"
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
        <button
          onClick={() => {
            if (!pasteText.trim()) {
              setState("failed");
              setStatus("Paste some text first.");
              return;
            }
            if (add("Pasted text", pasteText)) {
              setPasteText("");
              setState("done");
              setStatus("Sheet read — check it below, then import.");
            }
          }}
        >
          Read pasted sheet
        </button>
      </div>
      <SheetStatus state={state}>{status}</SheetStatus>

      {sheets.length > 0 && (
        <div className="sheet-import-grid" style={{ marginTop: 12 }}>
          {sheets.map((sheet) =>
            // Once the days are in the calendar the rows have done their job.
            // Leaving several dozen checked lines and a button that still
            // offers to import them reads as though nothing happened - so the
            // sheet folds down to the one thing left worth saying.
            sheet.imported ? (
              <div key={sheet.id} className="sheet-done">
                <span className="sheet-status-icon">
                  <CheckCircle />
                </span>
                <span className="sheet-done-text">
                  <b>
                    {sheet.imported} day{sheet.imported === 1 ? "" : "s"} imported
                  </b>{" "}
                  from {sheet.name}
                </span>
                <button
                  className="ghost small"
                  onClick={() => setSheets((prev) => prev.filter((x) => x.id !== sheet.id))}
                >
                  Done
                </button>
                <button
                  className="ghost small"
                  onClick={() =>
                    setSheets((prev) =>
                      prev.map((x) =>
                        x.id === sheet.id ? { ...x, imported: undefined } : x,
                      ),
                    )
                  }
                >
                  Show the rows again
                </button>
              </div>
            ) : sheet.found.kind === "holidaySpare" ? (
              <HolidaySpareImport
                key={sheet.id}
                onImport={onImport}
                title={`${sheet.name} — ${describeSheet(sheet.found)}`}
                initialText={sheet.text}
                initialName={sheet.name}
                onImported={(n) => markImported(sheet.id, n)}
              />
            ) : (
              <BookingSheetSlot
                key={sheet.id}
                title={`${sheet.name} — ${describeSheet(sheet.found)}`}
                Icon={Description}
                accent="steel"
                onImport={onImport}
                onSeasonAnchorDetected={onSeasonAnchorDetected}
                initialText={sheet.text}
                initialName={sheet.name}
                onImported={(n) => markImported(sheet.id, n)}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

interface BookingSheetSlotProps extends BookingSheetImportProps {
  title: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  accent: "steel" | "amber";
  /**
   * Text already read from a file elsewhere. Given this, the slot is a review
   * of one sheet rather than a place to drop one: the state is seeded from it
   * on the first render, so no effect has to reach in and set it afterwards.
   */
  initialText?: string;
  initialName?: string;
  /** Told when days actually went in, so the caller can put the sheet away. */
  onImported?: (count: number) => void;
}

/** Everything the review needs, derived from the sheet's text. */
function deriveBlocks(text: string) {
  const { blocks: parsedBlocks } = parseBookingSheetText(text, null);
  const workBlocks = parsedBlocks.filter((b) => b.isDayOff || b.rows.length > 0);
  const included: Record<number, boolean> = {};
  const dates: Record<number, string[]> = {};
  workBlocks.forEach((b, i) => {
    included[i] = true;
    dates[i] = b.dates.map(fmtDate);
  });
  return { blocks: workBlocks, included, dates };
}

function BookingSheetSlot({
  title,
  Icon,
  accent,
  onImport,
  onSeasonAnchorDetected,
  initialText,
  initialName,
  onImported,
}: BookingSheetSlotProps) {
  const handed = initialText != null;
  const seed = () => (handed ? deriveBlocks(initialText!) : null);
  const [pasteText, setPasteText] = useState(initialText ?? "");
  const [fileName, setFileName] = useState(initialName ?? "");
  const [isDragging, setIsDragging] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [sheetState, setSheetState] = useState<SheetState>("idle");
  // How many days this sheet has put into the calendar, so the panel can
  // say plainly that it worked rather than looking untouched.
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [blocks, setBlocks] = useState<SheetBlock[]>(() => seed()?.blocks ?? []);
  const [included, setIncluded] = useState<Record<number, boolean>>(
    () => seed()?.included ?? {}
  );
  const [rowDatesList, setRowDatesList] = useState<Record<number, string[]>>(
    () => seed()?.dates ?? {}
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
    const { anchorDate, seasonEndDate } = parseBookingSheetText(text, null);
    if (anchorDate) {
      onSeasonAnchorDetected(fmtDate(anchorDate));
    }
    const dateRangeNote =
      anchorDate && seasonEndDate
        ? ` Runs ${fmtDate(anchorDate)} to ${fmtDate(seasonEndDate)} — repeating patterns are applied to every matching week through then.`
        : "";
    const derived = deriveBlocks(text);
    setParseStatus(`${derived.blocks.length} block(s) found.${dateRangeNote}`);
    setBlocks(derived.blocks);
    setIncluded(derived.included);
    setRowDatesList(derived.dates);
    setTotalOverrides({});
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setSheetState("working");
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
      setSheetState("idle");
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
    // Which days this will land on, worked out here rather than tallied while
    // the calendar is being rebuilt. React runs an updater when it next
    // renders, not at the click, and may run it twice - so a count kept inside
    // one was sometimes still zero when it was read back, and the sheet said
    // it had imported nothing while the days were going in.
    const count = blocks.reduce(
      (n, b, i) =>
        included[i] ? n + (rowDatesList[i] || []).filter(Boolean).length : n,
      0,
    );

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
        });
      });
      return next;
    });
    setImportedCount(count);
    setSheetState(count > 0 ? "done" : "failed");
    if (count > 0) onImported?.(count);
    setParseStatus(
      count > 0
        ? `Imported — ${count} day${count === 1 ? "" : "s"} added to your calendar.`
        : "Nothing was imported — every row was unchecked.",
    );
  }

  return (
    <div
      className={
        "sheet-import-slot sheet-import-slot-" +
        accent +
        (importedCount ? " is-imported" : "")
      }
    >
      <h3>
        <span className="sheet-import-icon">
          <Icon />
        </span>
        {title}
      </h3>

      {!handed && (
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
      )}

      {!handed && (
        <>
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
        </>
      )}
      <SheetStatus state={sheetState}>{parseStatus}</SheetStatus>

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
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={handleImport}>
              {importedCount == null ? "Import checked rows" : "Import again"}
            </button>
            {importedCount != null && importedCount > 0 && (
              <span className="sheet-status sheet-status-done" style={{ marginTop: 0 }}>
                <span className="sheet-status-icon">
                  <CheckCircle />
                </span>
                <span>
                  {importedCount} day{importedCount === 1 ? "" : "s"} imported
                </span>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
