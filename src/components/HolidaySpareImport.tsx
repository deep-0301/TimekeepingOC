"use client";

import { useRef, useState } from "react";
import {
  parseHolidaySpareSheet,
  type HolidayDayPlan,
} from "@/lib/holidaySpareParser";
import { fmtHM, minToHHMM } from "@/lib/dateUtils";
import { extractPdfText } from "@/lib/pdfExtract";
import { newEmptyDayEntry, type EntriesMap, type EntryPiece } from "@/lib/types";
import InfoNote from "./InfoNote";
import { Description, FileUpload, WbSunny } from "./icons";

interface HolidaySpareImportProps {
  onImport: (updater: (prev: EntriesMap) => EntriesMap) => void;
  /**
   * Text already read and recognised elsewhere. Given this, the panel is a
   * review of one sheet rather than a place to drop one - the state is seeded
   * from it on the first render, so no effect has to set it afterwards.
   */
  initialText?: string;
  initialName?: string;
  /** Replaces the heading when several sheets are on screen at once. */
  title?: string;
}

const KIND_LABELS: Record<HolidayDayPlan["kind"], string> = {
  work: "Working",
  spare_manual: "Spare (add manually)",
  spare_timed: "Spare (pre-filled)",
  dayoff: "Day off",
};

export default function HolidaySpareImport({
  onImport,
  initialText,
  initialName,
  title,
}: HolidaySpareImportProps) {
  const handed = initialText != null;
  const seeded = () => (handed ? parseHolidaySpareSheet(initialText!) : []);
  const [pasteText, setPasteText] = useState(initialText ?? "");
  const [fileName, setFileName] = useState(initialName ?? "");
  const [isDragging, setIsDragging] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [plans, setPlans] = useState<HolidayDayPlan[]>(seeded);
  const [included, setIncluded] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(seeded().map((_, i) => [i, true]))
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  function runParse(text: string) {
    if (!text.trim()) {
      setParseStatus("Paste some text first.");
      return;
    }
    const parsed = parseHolidaySpareSheet(text);
    setPlans(parsed);
    const inc: Record<number, boolean> = {};
    parsed.forEach((_, i) => {
      inc[i] = true;
    });
    setIncluded(inc);
    setParseStatus(
      parsed.length
        ? `${parsed.length} day(s) found across ${
            new Set(parsed.map((p) => p.weekLabel)).size
          } week(s).`
        : "No weeks recognized - check the pasted text."
    );
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

  function handleImport() {
    let count = 0;
    onImport((prev) => {
      const next = { ...prev };
      plans.forEach((p, i) => {
        if (!included[i]) return;
        const day = next[p.dateStr] ? { ...next[p.dateStr] } : newEmptyDayEntry();
        if (p.kind === "dayoff") {
          day.dayOff = true;
          day.pieces = [];
          day.spare = null;
        } else if (p.kind === "work" && p.pieces) {
          const totalPlatMin = p.pieces.reduce((a, r) => a + r.platMin, 0);
          const allRuns = p.pieces.map((r) => r.run);
          day.fromSheet = true;
          day.sheetPlat = totalPlatMin;
          day.sheetPay = totalPlatMin;
          day.pieces = p.pieces.map(
            (r): EntryPiece => ({
              run: r.run,
              shiftId: r.shiftId,
              shiftPlat: totalPlatMin,
              shiftPay: totalPlatMin,
              onTime: r.onTime,
              offTime: r.offTime,
              onLoc: r.onLoc,
              offLoc: r.offLoc,
              platMin: r.platMin,
              allRuns,
            })
          );
        } else if (p.kind === "spare_manual" || p.kind === "spare_timed") {
          day.spare = {
            guaranteeHrs: p.guaranteeHrs ?? 8,
            runNumber: null,
            garage: p.garage,
            startMin: p.startMin,
          };
        }
        next[p.dateStr] = day;
        count++;
      });
      return next;
    });
    setParseStatus(`Imported ${count} day(s).`);
  }

  return (
    <div className="sheet-import-slot sheet-import-slot-steel">
      <h3>
        <span className="sheet-import-icon">
            <WbSunny />
          </span>
        {title ?? "Regular holiday work sheet"}
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
      {parseStatus && (
        <div className="note" style={{ marginTop: 6 }}>
          {parseStatus}
        </div>
      )}

      {plans.length > 0 && (
        <>
          <InfoNote label="Reviewing what was parsed">
            Review below, uncheck anything you don&apos;t want, then import.
            Floating-spare days come in with no report time or garage yet —
            add those from the Calendar once imported.
          </InfoNote>
          <table className="summary-table" style={{ marginTop: 6 }}>
            <tbody>
              {plans.map((p, i) => {
                let details = "";
                if (p.kind === "work" && p.pieces) {
                  const total = p.pieces.reduce((a, r) => a + r.platMin, 0);
                  details = `${p.pieces.map((r) => r.run).join(" + ")} — ${fmtHM(
                    total
                  )} plat`;
                } else if (p.kind === "spare_timed") {
                  details = `${p.garage || "—"} · Reports ${
                    p.startMin != null ? minToHHMM(p.startMin) : "—"
                  } · guarantee ${p.guaranteeHrs}h`;
                } else if (p.kind === "spare_manual") {
                  details = `Guarantee ${p.guaranteeHrs}h — garage/time added manually`;
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
                      />{" "}
                      {p.dateStr}
                    </td>
                    <td>
                      <b>{p.weekLabel}</b> —{" "}
                      <span className="badge estimate">{KIND_LABELS[p.kind]}</span>
                      <br />
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11.5px",
                          color: "var(--ink-soft)",
                        }}
                      >
                        {details}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <button onClick={handleImport}>Import checked days</button>
          </div>
        </>
      )}
    </div>
  );
}
