export function parseAmount(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : Math.round(raw * 100) / 100;

  let str = String(raw).trim();
  str = str.replace(/[€$£\s]/g, "");
  if (!str) return 0;

  // Trailing minus (e.g. "1.234,56-")
  let negative = false;
  if (str.endsWith("-")) {
    negative = true;
    str = str.slice(0, -1);
  } else if (str.startsWith("(") && str.endsWith(")")) {
    negative = true;
    str = str.slice(1, -1);
  }

  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Dutch: 1.234,56
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // English: 1,234.56
      str = str.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const afterComma = str.split(",")[1];
    if (afterComma && afterComma.length <= 2) {
      str = str.replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  }

  const result = parseFloat(str);
  if (isNaN(result)) return 0;
  const signed = negative ? -result : result;
  return Math.round(signed * 100) / 100;
}
