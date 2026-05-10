/**
 * Contrast utility functions for WCAG 2.2 and APCA (WCAG 3.0 draft) contrast calculations.
 *
 * Used by contrast token tests to verify design-system color pairs meet accessibility thresholds.
 */

// ---------------------------------------------------------------------------
// HSL → Hex conversion
// ---------------------------------------------------------------------------

/**
 * Convert HSL color values to a hex string (e.g. "#1a2b3c").
 *
 * @param h - Hue in degrees [0, 360)
 * @param s - Saturation as a percentage [0, 100]
 * @param l - Lightness as a percentage [0, 100]
 * @returns Lowercase hex string with leading "#"
 */
export function hslToHex(h: number, s: number, l: number): string {
  // Normalize s and l to [0, 1]
  const sn = s / 100;
  const ln = l / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (h < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (h < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (h < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (h < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  // Clamp to [0, 255]
  const r = Math.max(0, Math.min(255, Math.round((r1 + m) * 255)));
  const g = Math.max(0, Math.min(255, Math.round((g1 + m) * 255)));
  const b = Math.max(0, Math.min(255, Math.round((b1 + m) * 255)));

  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Hex parsing helper
// ---------------------------------------------------------------------------

/**
 * Parse a hex color string (with or without leading "#") into [r, g, b] in [0, 255].
 * Supports both 3-digit and 6-digit hex.
 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return [r, g, b];
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Parse a color string that may be:
 * - A hex string: "#rrggbb" or "#rgb"
 * - An HSL string: "220 40% 13%" (space-separated, percentages optional)
 *
 * Returns [r, g, b] in [0, 255].
 */
function parseColor(color: string): [number, number, number] {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    return hexToRgb(trimmed);
  }
  // Assume HSL format: "H S% L%" or "H S L" (percentages stripped)
  const parts = trimmed.split(/[\s,]+/);
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  const hex = hslToHex(h, s, l);
  return hexToRgb(hex);
}

// ---------------------------------------------------------------------------
// WCAG 2.x relative luminance and contrast ratio
// ---------------------------------------------------------------------------

/**
 * Compute the WCAG 2.x relative luminance of an sRGB color.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const linearize = (v: number): number => {
    const sRGB = v / 255;
    return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  const R = linearize(r);
  const G = linearize(g);
  const B = linearize(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Compute the WCAG 2.x contrast ratio between two colors.
 *
 * Accepts hex strings ("#rrggbb") or HSL strings ("H S% L%").
 *
 * @param fg - Foreground color
 * @param bg - Background color
 * @returns Contrast ratio in the range [1, 21]
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export function wcagContrastRatio(fg: string, bg: string): number {
  const [fr, fg_, fb] = parseColor(fg);
  const [br, bg_, bb] = parseColor(bg);
  const L1 = relativeLuminance(fr, fg_, fb);
  const L2 = relativeLuminance(br, bg_, bb);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// APCA Lc (Advanced Perceptual Contrast Algorithm)
// WCAG 3.0 Working Draft — implemented directly (apca-w3 package not installed)
// Reference: https://github.com/Myndex/SAPC-APCA
// ---------------------------------------------------------------------------

// APCA constants
const APCA_SA98G = {
  // sRGB linearization exponent
  mainTRC: 2.4,
  // Coefficients for sRGB → Y (luminance)
  sRco: 0.2126729,
  sGco: 0.7151522,
  sBco: 0.0721750,
  // Soft clamp for near-black
  blkThrs: 0.022,
  blkClmp: 1.414,
  // Scaling and offset
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
  // Delta threshold for very low contrast
  deltaYmin: 0.0005,
  // Output scaling
  loClip: 0.1,
  // Exponents for polarity
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
};

/**
 * Linearize an sRGB channel value (0–255) to linear light using the APCA exponent.
 */
function apcaLinearize(val: number): number {
  return Math.pow(val / 255, APCA_SA98G.mainTRC);
}

/**
 * Compute the APCA Y (estimated screen luminance) for an sRGB color.
 */
function apcaY(r: number, g: number, b: number): number {
  return (
    APCA_SA98G.sRco * apcaLinearize(r) +
    APCA_SA98G.sGco * apcaLinearize(g) +
    APCA_SA98G.sBco * apcaLinearize(b)
  );
}

/**
 * Apply the APCA soft black clamp to a Y value.
 */
function softClamp(Y: number): number {
  if (Y < APCA_SA98G.blkThrs) {
    return Y + Math.pow(APCA_SA98G.blkThrs - Y, APCA_SA98G.blkClmp);
  }
  return Y;
}

/**
 * Compute the APCA Lc (Lightness Contrast) value between a foreground and background color.
 *
 * Returns a signed value; the absolute value is the Lc magnitude.
 * Positive Lc = dark text on light background (BoW).
 * Negative Lc = light text on dark background (WoB).
 *
 * Accepts hex strings ("#rrggbb") or HSL strings ("H S% L%").
 *
 * Requirements: 5.2, 5.3, 5.4
 */
export function apcaLc(fg: string, bg: string): number {
  const [fr, fg_, fb] = parseColor(fg);
  const [br, bg_, bb] = parseColor(bg);

  const Ytxt = softClamp(apcaY(fr, fg_, fb));
  const Ybg = softClamp(apcaY(br, bg_, bb));

  // Skip if delta is too small
  if (Math.abs(Ybg - Ytxt) < APCA_SA98G.deltaYmin) {
    return 0;
  }

  let Lc: number;

  if (Ybg > Ytxt) {
    // Dark text on light background (BoW)
    const Sapc =
      Math.pow(Ybg, APCA_SA98G.normBG) - Math.pow(Ytxt, APCA_SA98G.normTXT);
    Lc = Sapc * APCA_SA98G.scaleBoW;
    if (Lc < APCA_SA98G.loClip) {
      return 0;
    }
    return (Lc - APCA_SA98G.loBoWoffset) * 100;
  } else {
    // Light text on dark background (WoB)
    const Sapc =
      Math.pow(Ybg, APCA_SA98G.revBG) - Math.pow(Ytxt, APCA_SA98G.revTXT);
    Lc = Sapc * APCA_SA98G.scaleWoB;
    if (Lc > -APCA_SA98G.loClip) {
      return 0;
    }
    return (Lc + APCA_SA98G.loWoBoffset) * 100;
  }
}
