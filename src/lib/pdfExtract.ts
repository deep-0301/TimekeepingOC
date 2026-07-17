export type ProgressCallback = (message: string) => void;

interface TextItemLike {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Extracts text from an uploaded PDF, client-side only.
 * Tries the embedded text layer first (fast, exact); if the PDF has
 * no usable text (a scanned/image PDF), falls back to OCR via Tesseract.
 */
export async function extractPdfText(
  file: File,
  onProgress?: ProgressCallback
): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  // Attempt 1: real embedded text layer (fast, exact)
  let fullText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: TextItemLike[] = content.items.map((it) => {
      const ti = it as { str: string; transform: number[]; width?: number };
      return {
        str: ti.str,
        x: ti.transform[4],
        y: ti.transform[5],
        w: ti.width || 0,
        h: Math.abs(ti.transform[3]) || 10,
      };
    });
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: TextItemLike[][] = [];
    let curLine: TextItemLike[] | null = null;
    let curY: number | null = null;
    const Y_TOL = 2.5;
    items.forEach((it) => {
      if (curY === null || Math.abs(it.y - curY) > Y_TOL) {
        curLine = [];
        lines.push(curLine);
        curY = it.y;
      }
      curLine!.push(it);
    });
    lines.forEach((line) => {
      line.sort((a, b) => a.x - b.x);
      let text = "";
      let prevEnd: number | null = null;
      line.forEach((it) => {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          if (gap > it.h * 0.25) text += " ";
        }
        text += it.str;
        prevEnd = it.x + it.w;
      });
      if (text.trim()) fullText += text + "\n";
    });
  }
  if (fullText.trim().length > 60) return fullText;

  // Attempt 2: no usable text layer found - scanned/image PDF, fall back to OCR
  onProgress?.(
    "This looks like a scanned PDF (no text layer) — running OCR, this can take a bit…"
  );
  const { recognize } = await import("tesseract.js");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const tesseractOptions = {
    workerPath: `${basePath}/tesseract/worker.min.js`,
    workerBlobURL: false,
    corePath: `${basePath}/tesseract/tesseract-core-lstm.js`,
    langPath: `${basePath}/tesseract/lang`,
    cachePath: `${basePath}/tesseract/lang`,
    gzip: true,
  };
  let ocrText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress?.(`OCR: reading page ${p} of ${pdf.numPages}…`);
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 3 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const result = await recognize(canvas, "eng", tesseractOptions);
    ocrText += result.data.text + "\n";
  }
  return ocrText;
}
