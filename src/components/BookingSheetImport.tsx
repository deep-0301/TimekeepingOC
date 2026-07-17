"use client";

import { useState } from "react";
import {
  hmToMin,
  parseBookingSheetText,
  type SheetBlock,
} from "@/lib/bookingSheetParser";
import { fmtDate, fmtHM } from "@/lib/dateUtils";
import { extractPdfText } from "@/lib/pdfExtract";
import { newEmptyDayEntry, type EntriesMap, type EntryPiece } from "@/lib/types";

interface BookingSheetImportProps {
  onImport: (updater: (prev: EntriesMap) => EntriesMap) => void;
}

export default function BookingSheetImport({
  onImport,
}: BookingSheetImportProps) {
  const [pasteText, setPasteText] = useState("");
  const [anchorDateInput, setAnchorDateInput] = useState("");
  const [parseStatus, setParseStatus] = useState("");
  const [blocks, setBlocks] = useState<SheetBlock[]>([]);
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [rowDates, setRowDates] = useState<Record<number, string>>({});

  function runParse(text: string) {
    if (!text.trim()) {
      setParseStatus("Paste some text first.");
      return;
    }
    let manualAnchor: Date | null = null;
    if (anchorDateInput) {
      const [y, m, d] = anchorDateInput.split("-").map(Number);
      manualAnchor = new Date(y, m - 1, d);
    }
    const { anchorDate, blocks: parsedBlocks } = parseBookingSheetText(
      text,
      manualAnchor
    );
    if (anchorDate) setAnchorDateInput(fmtDate(anchorDate));
    setParseStatus(`${parsedBlocks.length} block(s) found.`);

    const workBlocks = parsedBlocks.filter(
      (b) => b.isDayOff || b.rows.length > 0
    );
    setBlocks(workBlocks);
    const inc: Record<number, boolean> = {};
    const dates: Record<number, string> = {};
    workBlocks.forEach((b, i) => {
      inc[i] = true;
      dates[i] = b.date ? fmtDate(b.date) : "";
    });
    setIncluded(inc);
    setRowDates(dates);
  }

  async function handleFile(file: File) {
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
      setAnchorDateInput("");
      setParseStatus("File read — parsing…");
      runParse(text);
    } catch (err) {
      console.error(err);
      setParseStatus(
        "Could not read that PDF automatically — try opening it and pasting the text instead."
      );
    }
  }

  function handleImport() {
    let count = 0;
    onImport((prev) => {
      const next = { ...prev };
      blocks.forEach((b, i) => {
        if (!included[i]) return;
        const dateStr = rowDates[i];
        if (!dateStr) return;
        const day = next[dateStr]
          ? { ...next[dateStr] }
          : newEmptyDayEntry();
        if (b.isDayOff) {
          day.dayOff = true;
          day.pieces = [];
          next[dateStr] = day;
          count++;
          return;
        }
        const hasTotals = !!(b.totalPlat && b.totalPay);
        const anySpare = b.rows.some((r) => r.isSpare);
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
          day.nonPlatform = (day.nonPlatform || 0) + totalMin / 60;
        }
        if (b.isHoliday) day.isStat = true;
        next[dateStr] = day;
        count++;
      });
      return next;
    });
    setParseStatus(`Imported ${count} day(s).`);
  }

  return (
    <section className="panel">
      <h2>Import your booking sheet</h2>
      <div className="note">
        Upload your Employee Booking Sheet PDF and it updates the calendar
        above directly — it reads the file in your browser, and if
        it&apos;s a scanned PDF (no selectable text) it automatically runs
        OCR on it, entirely on your device. Works with both kinds of sheet:
        your regular Monday–Friday board, and the weekend/general-spare
        sheet with explicit holiday-shift dates (e.g. &ldquo;Canada Day
        SPARE 01-Jul-2026&rdquo;). It pulls out every shift, run number,
        the season start date, and day-off/holiday markers automatically —
        upload both sheets one after another and they&apos;ll merge onto
        the same calendar. You can also paste text manually below if
        you&apos;d rather.
      </div>
      <div style={{ marginTop: 8 }}>
        <input
          type="file"
          accept=".pdf,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      <textarea
        className="sheet-paste"
        rows={7}
        placeholder="…or paste your booking sheet text here"
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
      />
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        <div className="field" style={{ flex: "0 0 auto" }}>
          <label>Season start date (auto-filled from the PDF, editable)</label>
          <input
            type="date"
            value={anchorDateInput}
            onChange={(e) => setAnchorDateInput(e.target.value)}
          />
        </div>
        <button onClick={() => runParse(pasteText)}>Parse</button>
        <span className="note" style={{ margin: 0 }}>
          {parseStatus}
        </span>
      </div>

      {blocks.length === 0 ? null : (
        <>
          <div className="note" style={{ marginTop: 10 }}>
            Review below, uncheck anything you don&apos;t want, fix any date
            that looks off, then import.
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
                        value={rowDates[i] || ""}
                        onChange={(e) =>
                          setRowDates({ ...rowDates, [i]: e.target.value })
                        }
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
    </section>
  );
}
