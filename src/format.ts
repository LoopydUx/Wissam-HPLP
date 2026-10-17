export function trimFixed(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value)
    .toFixed(decimals)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

export function signedTrim(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 5 * Math.pow(10, -(decimals + 1))) return "0";
  const body = trimFixed(Math.abs(value), decimals);
  return value < 0 ? `−${body}` : body;
}

export function formatGain(gain: number): string {
  if (!Number.isFinite(gain)) return "—";
  if (gain >= 0.9995) return "1.000";
  if (gain >= 0.1) return gain.toFixed(3);
  if (gain >= 0.01) return gain.toFixed(4);
  return gain.toPrecision(2);
}

export function formatPhase(radians: number): string {
  const degrees = (radians * 180) / Math.PI;
  if (Math.abs(degrees) < 0.05) return "0°";
  const body = trimFixed(Math.abs(degrees), Math.abs(degrees) >= 10 ? 1 : 1);
  const rounded = Math.abs(degrees) >= 9.95 ? trimFixed(Math.abs(degrees), 1) : body;
  return degrees > 0 ? `+${rounded}°` : `−${rounded}°`;
}

export function formatVolts(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.005) return "0 V";
  const sign = value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)} V`;
}

export function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return "—";
  if (hz >= 1_000_000) return `${signedTrim(hz / 1_000_000, 2)} MHz`;
  if (hz >= 10_000) return `${signedTrim(hz / 1000, 2)} kHz`;
  if (hz >= 1000) return `${signedTrim(hz / 1000, 3)} kHz`;
  if (hz >= 100) return `${signedTrim(hz, 2)} Hz`;
  if (hz >= 10) return `${signedTrim(hz, 2)} Hz`;
  return `${signedTrim(hz, 3)} Hz`;
}

export function formatSeconds(seconds: number): string {
  const a = Math.abs(seconds);
  if (!(a > 0)) return "0 s";
  if (a >= 1) return `${signedTrim(seconds, 3)} s`;
  if (a >= 1e-3) return `${signedTrim(seconds * 1e3, 3)} ms`;
  if (a >= 1e-6) return `${signedTrim(seconds * 1e6, 3)} µs`;
  return `${signedTrim(seconds * 1e9, 2)} ns`;
}

export function formatOhms(ohms: number): string {
  if (ohms >= 1_000_000) return `${signedTrim(ohms / 1_000_000, 3)} MΩ`;
  if (ohms >= 1000) return `${signedTrim(ohms / 1000, 3)} kΩ`;
  return `${signedTrim(ohms, 2)} Ω`;
}

export function formatFarads(farads: number): string {
  if (farads >= 1e-6) return `${signedTrim(farads * 1e6, 3)} µF`;
  if (farads >= 1e-9) return `${signedTrim(farads * 1e9, 3)} nF`;
  return `${signedTrim(farads * 1e12, 2)} pF`;
}

function decimalPlaces(step: number): number {
  const scaled = Math.round(step * 1e6) / 1e6;
  const text = scaled.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : Math.min(4, text.length - dot - 1);
}

export function formatTick(value: number, step: number): string {
  if (Math.abs(value) < Math.abs(step) * 1e-3) return "0";
  const snapped = Math.round(value / step) * step;
  return signedTrim(snapped, decimalPlaces(step));
}

export function inputString(value: number, unitScale: number): string {
  const shown = value / unitScale;
  if (!Number.isFinite(shown)) return "";
  const abs = Math.abs(shown);
  const decimals = abs >= 100 ? 2 : abs >= 10 ? 3 : 4;
  return shown.toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
