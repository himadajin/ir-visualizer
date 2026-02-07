interface FontMetrics {
  width: number;
  height: number;
}

let cachedMetrics: FontMetrics | null = null;

/**
 * Measures the width of a single character and the line height
 * for a given font and font size.
 *
 * Assumes a monospace font where all characters have the same width.
 */
export const getFontMetrics = (
  fontFamily: string = "monospace",
  fontSize: string = "14px",
  lineHeight: string = "20px",
): FontMetrics => {
  if (cachedMetrics) {
    return cachedMetrics;
  }

  if (typeof document === "undefined") {
    // Fallback for non-browser environments
    return { width: 8, height: 20 };
  }

  const div = document.createElement("div");
  div.style.fontFamily = fontFamily;
  div.style.fontSize = fontSize;
  div.style.lineHeight = lineHeight;
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre";
  // Use a representative character for monospace
  div.textContent = "M";

  document.body.appendChild(div);
  const rect = div.getBoundingClientRect();
  document.body.removeChild(div);

  cachedMetrics = {
    width: rect.width,
    height: parseFloat(lineHeight) || rect.height, // trust explicit line-height if parsed, else measure
  };

  // If width is 0 (e.g. some test envs), fallback
  if (cachedMetrics.width === 0) {
    cachedMetrics.width = 8;
  }

  return cachedMetrics;
};
