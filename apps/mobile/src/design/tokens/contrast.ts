function parseHex(color: string): [number, number, number] {
  const normalized = color.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Only opaque six-digit hex colours are supported: ${color}`);
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  ];
}

function linearize(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(color: string): number {
  const [red, green, blue] = parseHex(color);
  return (
    0.2126 * linearize(red ?? 0) + 0.7152 * linearize(green ?? 0) + 0.0722 * linearize(blue ?? 0)
  );
}

/** WCAG 2.1 contrast ratio between two opaque colours. */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function minContrastRatio(foreground: string, background: string): number {
  return Math.round(contrastRatio(foreground, background) * 100) / 100;
}
