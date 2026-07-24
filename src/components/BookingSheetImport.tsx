"use client";

import { useRef, useState } from "react";
import {
  hmToMin,
  parseBookingSheetText,
  type SheetBlock,
} from "@/lib/bookingSheetParser";
import { fmtDate, fmtHM, parseDateStr } from "@/lib/dateUtils";
import { extractPdfText } from "@/lib/pdfExtract";
import { newEmptyDayEntry, type EntriesMap, type EntryPiece } from "@/lib/types";

interface BookingSheetImportProps {
  onImport: (updater: (prev: EntriesMap) => EntriesMap) => void;
  onSeasonAnchorDetected: (dateStr: string) => void;
}

export default function BookingSheetImport({
  onImport,
  onSeasonAnchorDetected,
}: BookingSheetImportProps) {
  return (
    <section className="panel">
      <h2>Import your booking sheets</h2>
      <div className="sheet-import-grid">
        <BookingSheetSlot
          title="Weekday (Mon–Fri) sheet"
          icon="🗓️"
          accent="steel"
          onImport={onImport}
          onSeasonAnchorDetected={onSeasonAnchorDetected}
        />
        <BookingSheetSlot
          title="Weekend / holiday sheet"
          icon="🎉"
          accent="amber"
          onImport={onImport}
          onSeasonAnchorDetected={onSeasonAnchorDetected}
        />
      </div>
    </section>
  );
}

interface BookingSheetSlotProps extends BookingSheetImportProps {
  title: string;
  icon: string;
  accent: "steel" | "amber";
}

function BookingSheetSlot({
  title,
  icon,
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
          if (hasTotals) {
            day.pieces = b.rows.map(
              (r): EntryPiece => ({
                run: r.run,
                shiftId: r.shiftCode,
                onTime: r.onTime,
                offTime: r.offTime,
                onLoc: r.onLoc,
                offLoc: r.offLoc,
                platMin: hmToMin(r.segPlat || r.totalGuarantee),
                shiftPlat: 0,
                shiftPay: 0,
                allRuns: b.rows.map((rr) => rr.run),
              })
            );
            day.fromSheet = true;
            day.sheetPlat = hmToMin(b.totalPlat);
            day.sheetPay = hmToMin(b.totalPay);
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
        <span className="sheet-import-icon">{icon}</span>
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
            <div className="dropzone-icon">📄</div>
            <div className="dropzone-filename">{fileName}</div>
            <div className="dropzone-hint">Click or drop to replace</div>
          </>
        ) : (
          <>
            <div className="dropzone-icon">⬆️</div>
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
          <div className="note" style={{ marginTop: 10 }}>
            Review below, uncheck anything you don&apos;t want, fix the first
            date if it looks off (the rest of that pattern&apos;s dates shift
            with it), then import.
          </div>
          <table className="summary-table" style={{ marginTop: 6 }}>
            <tbody>
              {blocks.map((b, i) => {
                const hasTotals = !!(b.totalPlat && b.totalPay);
                const anySpare = b.rows.some((r) => r.isSpare);
                const kind = b.isDayOff
                  ? "Day off"
                  : hasTotals
                  ? "Driving day"
                  : anySpare
                  ? "Spare / standby"
                  : "Unclear — check manually";
                const runsDesc = b.rows.map((r) => r.run).join(" + ");
                let hoursDesc = "";
                if (b.isDayOff) hoursDesc = "";
                else if (hasTotals) hoursDesc = `Plat ${b.totalPlat} / Pay ${b.totalPay}`;
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
