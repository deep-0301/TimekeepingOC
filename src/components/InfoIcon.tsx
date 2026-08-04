/**
 * The "more about this" glyph.
 *
 * Drawn rather than set as the letter "i" in a bordered button: a text glyph
 * sits on the font's baseline, so it never centres properly in a circle and
 * shifts with the font stack. Strokes use currentColor so the button's hover
 * and open states colour it without a second rule.
 */
export default function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle
        cx="10"
        cy="10"
        r="8.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="10" cy="6.1" r="1.15" fill="currentColor" />
      <path
        d="M10 9.1v5.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
