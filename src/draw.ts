import { frequencyResponse, type Sample, type Waveform } from "./sim.ts";
import type { SquarePoint } from "./square.ts";
import { formatTick } from "./format.ts";

function hResistor(x1: number, x2: number, y: number): string {
  const teeth = 7;
  const lead = 4;
  const amp = 8;
  const z0 = x1 + lead;
  const z1 = x2 - lead;
  const dx = (z1 - z0) / teeth;
  let d = `M ${x1} ${y} L ${z0} ${y}`;
  for (let i = 0; i < teeth; i++) {
    const dir = i % 2 === 0 ? -1 : 1;
    d += ` L ${z0 + (i + 0.5) * dx} ${y + dir * amp}`;
  }
  d += ` L ${z1} ${y} L ${x2} ${y}`;
  return d;
}

function vResistor(x: number, y1: number, y2: number): string {
  const teeth = 6;
  const lead = 16;
  const amp = 8;
  const z0 = y1 + lead;
  const z1 = y2 - lead;
  const dy = (z1 - z0) / teeth;
  let d = `M ${x} ${y1} L ${x} ${z0}`;
  for (let i = 0; i < teeth; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    d += ` L ${x + dir * amp} ${z0 + (i + 0.5) * dy}`;
  }
  d += ` L ${x} ${z1} L ${x} ${y2}`;
  return d;
}

function waveIcon(wave: Waveform, x: number, y: number): string {
  if (wave === "sine") {
    return `<path d="M ${x} ${y} q 6 -14 12 0 t 12 0" class="wave-icon"/>`;
  }
  if (wave === "square") {
    return `<path d="M ${x} ${y + 6} H ${x + 8} V ${y - 6} H ${x + 16} V ${y + 6} H ${x + 24}" class="wave-icon"/>`;
  }
  return `<path d="M ${x} ${y + 6} H ${x + 10} V ${y - 6} H ${x + 24}" class="wave-icon"/>`;
}

export function circuitSvg(kind: "lp" | "hp", rLabel: string, cLabel: string, wave: Waveform): string {
  const yTop = 64;
  const yGnd = 178;
  const xSrc = 86;
  const xNode = 392;
  const srcR = 30;
  const srcCy = 118;

  const ground = `
    <line x1="${xSrc}" y1="${yGnd}" x2="${xNode}" y2="${yGnd}" class="wire"/>
    <circle cx="${xSrc}" cy="${yGnd}" r="3.2" class="joint"/>
    <circle cx="${xNode}" cy="${yGnd}" r="3.2" class="joint"/>
    <g class="ground" transform="translate(${(xSrc + xNode) / 2} ${yGnd})">
      <line x1="-16" y1="0" x2="16" y2="0"/>
      <line x1="-10" y1="7" x2="10" y2="7"/>
      <line x1="-4" y1="14" x2="4" y2="14"/>
    </g>
    <text class="gnd-label" x="${(xSrc + xNode) / 2}" y="${yGnd + 32}" text-anchor="middle">ground</text>
  `;

  const source = `
    <line x1="${xSrc}" y1="${srcCy + srcR}" x2="${xSrc}" y2="${yGnd}" class="wire"/>
    <circle cx="${xSrc}" cy="${srcCy}" r="${srcR}" class="source"/>
    <text class="polarity" x="${xSrc + 10}" y="${srcCy - 8}">+</text>
    <text class="polarity" x="${xSrc + 12}" y="${srcCy + 18}">−</text>
    <line x1="${xSrc}" y1="${srcCy - srcR}" x2="${xSrc}" y2="${yTop}" class="wire"/>
    <text class="term" x="16" y="${srcCy - 6}">Vin</text>
    ${waveIcon(wave, 18, srcCy + 18)}
  `;

  const output = `
    <circle cx="${xNode}" cy="${yTop}" r="4.5" class="joint out"/>
    <line x1="${xNode}" y1="${yTop}" x2="${xNode + 36}" y2="${yTop}" class="wire out-lead"/>
    <text class="term out-label" x="${xNode + 42}" y="${yTop + 5}">Vout</text>
  `;

  let series = "";
  let shunt = "";
  if (kind === "lp") {
    const x1 = 150;
    const x2 = 300;
    series = `
      <line x1="${xSrc}" y1="${yTop}" x2="${x1}" y2="${yTop}" class="wire"/>
      <path d="${hResistor(x1, x2, yTop)}" class="part"/>
      <line x1="${x2}" y1="${yTop}" x2="${xNode}" y2="${yTop}" class="wire"/>
      <text class="part-label" x="${(x1 + x2) / 2}" y="${yTop - 18}" text-anchor="middle">R = ${rLabel}</text>
    `;
    shunt = `
      <line x1="${xNode}" y1="${yTop}" x2="${xNode}" y2="108" class="wire"/>
      <line x1="${xNode - 20}" y1="108" x2="${xNode + 20}" y2="108" class="part"/>
      <line x1="${xNode - 20}" y1="124" x2="${xNode + 20}" y2="124" class="part"/>
      <line x1="${xNode}" y1="124" x2="${xNode}" y2="${yGnd}" class="wire"/>
      <text class="part-label" x="${xNode + 28}" y="122">C = ${cLabel}</text>
    `;
  } else {
    const plateL = 168;
    const plateR = 190;
    series = `
      <line x1="${xSrc}" y1="${yTop}" x2="${plateL}" y2="${yTop}" class="wire"/>
      <line x1="${plateL}" y1="${yTop - 18}" x2="${plateL}" y2="${yTop + 18}" class="part"/>
      <line x1="${plateR}" y1="${yTop - 18}" x2="${plateR}" y2="${yTop + 18}" class="part"/>
      <line x1="${plateR}" y1="${yTop}" x2="${xNode}" y2="${yTop}" class="wire"/>
      <text class="part-label" x="${(plateL + plateR) / 2}" y="${yTop - 26}" text-anchor="middle">C = ${cLabel}</text>
    `;
    shunt = `
      <path d="${vResistor(xNode, yTop, yGnd)}" class="part"/>
      <text class="part-label" x="${xNode + 16}" y="132">R = ${rLabel}</text>
    `;
  }

  return `
    <svg class="schematic" viewBox="0 0 560 228" role="img" aria-label="${kind === "lp" ? "Low-pass" : "High-pass"} RC schematic">
      ${ground}
      ${source}
      ${series}
      ${output}
      ${shunt}
    </svg>
  `;
}

export interface ScopeModel {
  samples: Sample[];
  output: "lp" | "hp";
  tStart: number;
  tEnd: number;
  yMin: number;
  yMax: number;
  yStep: number;
  wave: Waveform;
  tau: number;
  /** Absolute time of the step cursor, or null. */
  cursor: number | null;
  /** Periodic plots label time from the left edge. The step labels absolute time. */
  relativeTime: boolean;
}

export function scopeSvg(model: ScopeModel): string {
  const W = 640;
  const H = 340;
  const padL = 58;
  const padR = 16;
  const padT = 18;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const tSpan = model.tEnd - model.tStart || 1;
  const ySpan = model.yMax - model.yMin || 1;

  const xOf = (t: number) => padL + ((t - model.tStart) / tSpan) * plotW;
  const yOf = (v: number) => padT + ((model.yMax - v) / ySpan) * plotH;

  const pts = (key: "vin" | "lp" | "hp") =>
    model.samples
      .map((s) => {
        const x = xOf(s.t);
        const y = yOf(s[key]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .filter(Boolean)
      .join(" ");

  const grid: string[] = [];
  const labels: string[] = [];

  const t0ms = model.tStart * 1000;
  const t1ms = model.tEnd * 1000;
  const timeStep = niceStep(Math.abs(t1ms - t0ms), 5);
  const firstTick = Math.ceil((t0ms - 1e-9) / timeStep) * timeStep;
  for (let ms = firstTick; ms <= t1ms + timeStep * 1e-6; ms += timeStep) {
    const t = ms / 1000;
    if (t < model.tStart - 1e-9 || t > model.tEnd + 1e-9) continue;
    const x = xOf(t);
    grid.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" class="grid"/>`);
    const shown = model.relativeTime ? ms - t0ms : ms;
    labels.push(`<text class="tick" x="${x}" y="${H - 16}" text-anchor="middle">${formatTick(shown, timeStep)}</text>`);
  }

  const yFirst = Math.ceil((model.yMin - 1e-9) / model.yStep) * model.yStep;
  for (let v = yFirst; v <= model.yMax + model.yStep * 1e-6; v += model.yStep) {
    if (v < model.yMin - 1e-9 || v > model.yMax + 1e-9) continue;
    const y = yOf(v);
    const zero = Math.abs(v) < model.yStep * 1e-3;
    grid.push(`<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" class="${zero ? "zero" : "grid"}"/>`);
    labels.push(`<text class="tick" x="${padL - 8}" y="${y + 4}" text-anchor="end">${formatTick(v, model.yStep)}</text>`);
  }

  const markers: string[] = [];
  if (model.wave === "step") {
    for (const mark of [
      { t: 0, name: "step" },
      { t: model.tau, name: "τ" },
    ]) {
      if (mark.t < model.tStart || mark.t > model.tEnd) continue;
      const x = xOf(mark.t);
      markers.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" class="mark"/>`);
      markers.push(`<text class="mark-label" x="${x + 4}" y="${padT + 14}">${mark.name}</text>`);
    }
  }

  let cursor = "";
  if (model.cursor !== null && model.cursor >= model.tStart && model.cursor <= model.tEnd) {
    const x = xOf(model.cursor);
    cursor = `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" class="cursor"/>`;
  }

  const title = model.output === "lp" ? "Low-pass voltage versus time" : "High-pass voltage versus time";

  return `
    <svg class="scope" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}. Blue is the input and orange is the output.">
      <rect class="scope-bg" x="0" y="0" width="${W}" height="${H}" rx="12"/>
      ${grid.join("")}
      ${markers.join("")}
      <polyline points="${pts("vin")}" class="trace in"/>
      <polyline points="${pts(model.output)}" class="trace out"/>
      ${cursor}
      ${labels.join("")}
      <text class="axis-name" x="${padL + plotW / 2}" y="${H - 2}" text-anchor="middle">time (ms)</text>
      <text class="axis-name" x="16" y="${padT + plotH / 2}" text-anchor="middle" transform="rotate(-90 16 ${padT + plotH / 2})">voltage (V)</text>
    </svg>
  `;
}

export function bodeSvg(tau: number, fc: number, freq: number): string {
  const W = 720;
  const H = 300;
  const padL = 56;
  const padR = 20;
  const padT = 16;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const decadeDown = (f: number) => Math.pow(10, Math.floor(Math.log10(f)));
  const decadeUp = (f: number) => Math.pow(10, Math.ceil(Math.log10(f * (1 + 1e-12))));
  let fLo = decadeDown(fc / 100);
  let fHi = decadeUp(fc * 100);
  if (freq < fLo) fLo = decadeDown(freq);
  if (freq > fHi) fHi = decadeUp(freq);
  fLo = Math.max(fLo, 0.01);
  fHi = Math.max(fHi, fLo * 10);

  const xOf = (f: number) => padL + ((Math.log10(f) - Math.log10(fLo)) / (Math.log10(fHi) - Math.log10(fLo))) * plotW;
  const yOf = (g: number) => padT + ((1.08 - g) / 1.08) * plotH;

  const grid: string[] = [];
  const labels: string[] = [];
  for (let g = 0; g <= 1.001; g += 0.25) {
    const y = yOf(g);
    grid.push(`<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" class="${g === 0 ? "zero" : "grid"}"/>`);
    labels.push(`<text class="tick" x="${padL - 8}" y="${y + 4}" text-anchor="end">${formatTick(g, 0.25)}</text>`);
  }
  const y707 = yOf(1 / Math.SQRT2);
  grid.push(`<line x1="${padL}" y1="${y707}" x2="${padL + plotW}" y2="${y707}" class="ref"/>`);
  labels.push(`<text class="ref-label" x="${padL + plotW - 4}" y="${y707 - 6}" text-anchor="end">0.707</text>`);

  const p0 = Math.ceil(Math.log10(fLo) - 1e-9);
  const p1 = Math.floor(Math.log10(fHi) + 1e-9);
  for (let p = p0; p <= p1; p++) {
    const f = Math.pow(10, p);
    const x = xOf(f);
    grid.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" class="grid"/>`);
    labels.push(`<text class="tick" x="${x}" y="${H - 18}" text-anchor="middle">${decadeLabel(f)}</text>`);
  }

  const curve = (kind: "lp" | "hp") => {
    const pts: string[] = [];
    const n = 280;
    for (let i = 0; i < n; i++) {
      const f = fLo * Math.pow(fHi / fLo, i / (n - 1));
      const gain = frequencyResponse(kind, f, tau).gain;
      pts.push(`${xOf(f).toFixed(2)},${yOf(gain).toFixed(2)}`);
    }
    return pts.join(" ");
  };

  const xFc = xOf(fc);
  const xF = xOf(Math.min(fHi, Math.max(fLo, freq)));
  const gLp = frequencyResponse("lp", freq, tau).gain;
  const gHp = frequencyResponse("hp", freq, tau).gain;
  const same = Math.abs(freq - fc) / fc < 0.02;

  return `
    <svg class="bode" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gain of both filters versus frequency. A marker shows the cutoff and the selected frequency.">
      <rect class="bode-bg" x="0" y="0" width="${W}" height="${H}" rx="12"/>
      ${grid.join("")}
      <line x1="${xFc}" y1="${padT}" x2="${xFc}" y2="${padT + plotH}" class="fc-line"/>
      <line x1="${xF}" y1="${padT}" x2="${xF}" y2="${padT + plotH}" class="f-line"/>
      <polyline points="${curve("lp")}" class="bode-lp"/>
      <polyline points="${curve("hp")}" class="bode-hp"/>
      <circle cx="${xF}" cy="${yOf(gLp)}" r="4.5" class="dot lp"/>
      <circle cx="${xF}" cy="${yOf(gHp)}" r="4.5" class="dot hp"/>
      <text class="mark-label" x="${xFc}" y="${padT + 14}" text-anchor="${same ? "end" : "middle"}">${same ? "" : "fc"}</text>
      <text class="f-label" x="${xF + (same ? 0 : 6)}" y="${padT + 14}" text-anchor="${xF > padL + plotW * 0.82 ? "end" : "start"}">${same ? "f = fc" : "f"}</text>
      ${labels.join("")}
      <text class="axis-name dark" x="${padL + plotW / 2}" y="${H - 2}" text-anchor="middle">frequency (log scale)</text>
      <text class="axis-name dark" x="14" y="${padT + plotH / 2}" text-anchor="middle" transform="rotate(-90 14 ${padT + plotH / 2})">gain</text>
    </svg>
  `;
}

function decadeLabel(f: number): string {
  if (f >= 1_000_000) return `${trimNum(f / 1_000_000)} MHz`;
  if (f >= 1000) return `${trimNum(f / 1000)} kHz`;
  if (f >= 1) return `${trimNum(f)} Hz`;
  return `${trimNum(f)} Hz`;
}

function trimNum(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function niceStep(span: number, ticks: number): number {
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, ticks);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  let best = pow;
  let bestScore = Infinity;
  for (const n of [1, 2, 2.5, 5, 10]) {
    const step = n * pow;
    const count = span / step;
    const score = Math.abs(count - ticks) + (count < 3 ? 8 : 0);
    if (score < bestScore) {
      best = step;
      bestScore = score;
    }
  }
  return best;
}

export function niceY(min: number, max: number): { min: number; max: number; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1, max: 1, step: 0.5 };
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  let a = min - pad;
  let b = max + pad;
  const step = niceStep(b - a, 5);
  a = Math.floor(a / step + 1e-9) * step;
  b = Math.ceil(b / step - 1e-9) * step;
  if (Math.abs(a) < step * 1e-6) a = 0;
  if (Math.abs(b) < step * 1e-6) b = 0;
  if (a === b) b = a + step;
  return { min: a, max: b, step };
}

/** Magnify a fitted axis around its center. Zoom 1 leaves the fit alone. */
export function zoomAround(min: number, max: number, zoom: number): { min: number; max: number; step: number } {
  const fit = niceY(min, max);
  if (!(zoom > 1.02)) return fit;
  const mid = (fit.min + fit.max) / 2;
  const half = (fit.max - fit.min) / (2 * zoom);
  const step = niceStep(Math.max(half * 2, 1e-12), 5);
  let a = Math.floor((mid - half) / step + 1e-9) * step;
  let b = Math.ceil((mid + half) / step - 1e-9) * step;
  if (!(b > a)) b = a + step;
  return { min: a, max: b, step };
}

export function hpSquareCircuitSvg(rLabel: string, cLabel: string): string {
  const yTop = 68;
  const yGnd = 200;
  const xSrc = 108;
  const xNode = 498;
  const srcR = 28;
  const srcCy = 134;
  const plateL = 246;
  const plateR = 270;

  return `
    <svg class="schematic" viewBox="0 0 680 248" role="img" aria-label="High-pass RC circuit. The input feeds a series capacitor. The resistor runs from the output node to ground. Output voltage is measured across the resistor.">
      <defs>
        <marker id="hp-i-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 Z" class="current-head"/>
        </marker>
      </defs>
      <line x1="${xSrc}" y1="${yGnd}" x2="${xNode}" y2="${yGnd}" class="wire"/>
      <circle cx="${xSrc}" cy="${yGnd}" r="3.2" class="joint"/>
      <circle cx="${xNode}" cy="${yGnd}" r="3.2" class="joint"/>
      <g class="ground" transform="translate(${(xSrc + xNode) / 2} ${yGnd})">
        <line x1="-16" y1="0" x2="16" y2="0"/>
        <line x1="-10" y1="7" x2="10" y2="7"/>
        <line x1="-4" y1="14" x2="4" y2="14"/>
      </g>
      <text class="gnd-label" x="${(xSrc + xNode) / 2}" y="${yGnd + 32}" text-anchor="middle">ground</text>

      <line x1="${xSrc}" y1="${srcCy + srcR}" x2="${xSrc}" y2="${yGnd}" class="wire"/>
      <circle cx="${xSrc}" cy="${srcCy}" r="${srcR}" class="source"/>
      <text class="polarity" x="${xSrc + 8}" y="${srcCy - 6}">+</text>
      <text class="polarity" x="${xSrc + 10}" y="${srcCy + 16}">−</text>
      <line x1="${xSrc}" y1="${srcCy - srcR}" x2="${xSrc}" y2="${yTop}" class="wire"/>
      <text class="term" x="18" y="${srcCy - 4}">Vin</text>
      ${waveIcon("square", 22, srcCy + 22)}

      <line x1="${xSrc}" y1="${yTop}" x2="${plateL}" y2="${yTop}" class="wire"/>
      <line x1="${plateL}" y1="${yTop - 22}" x2="${plateL}" y2="${yTop + 22}" class="part"/>
      <line x1="${plateR}" y1="${yTop - 22}" x2="${plateR}" y2="${yTop + 22}" class="part"/>
      <line x1="${plateR}" y1="${yTop}" x2="${xNode}" y2="${yTop}" class="wire"/>
      <text class="polarity" x="${plateL - 22}" y="${yTop + 6}">+</text>
      <text class="polarity" x="${plateR + 8}" y="${yTop + 6}">−</text>
      <text class="part-label" x="${(plateL + plateR) / 2}" y="${yTop - 30}" text-anchor="middle">VC</text>
      <text class="part-label" x="${(plateL + plateR) / 2}" y="${yTop + 48}" text-anchor="middle">C = ${cLabel}</text>

      <circle cx="${xNode}" cy="${yTop}" r="4.5" class="joint out"/>
      <path d="${vResistor(xNode, yTop, yGnd)}" class="part"/>
      <text class="polarity" x="${xNode + 18}" y="${yTop + 22}">+</text>
      <text class="polarity" x="${xNode + 18}" y="${yGnd - 8}">−</text>
      <text class="part-label" x="${xNode + 36}" y="140">R = ${rLabel}</text>

      <line x1="${xNode - 46}" y1="96" x2="${xNode - 46}" y2="168" class="current-arrow" marker-end="url(#hp-i-arrow)"/>
      <text class="part-label" x="${xNode - 58}" y="128" text-anchor="end">I</text>

      <line x1="${xNode}" y1="${yTop}" x2="${xNode + 46}" y2="${yTop}" class="wire out-lead"/>
      <text class="term out-label" x="${xNode + 52}" y="${yTop + 5}">Vout</text>
    </svg>
  `;
}

export interface HpScopeMarker {
  t: number;
  label: string;
}

export interface HpScopeModel {
  samples: SquarePoint[];
  tStart: number;
  tEnd: number;
  yMin: number;
  yMax: number;
  yStep: number;
  showVc: boolean;
  showI: boolean;
  iMin: number;
  iMax: number;
  iStep: number;
  cursor: SquarePoint | null;
  cursorBefore: SquarePoint | null;
  bands: { t0: number; t1: number }[];
  edges: HpScopeMarker[];
  tauMarks: HpScopeMarker[];
}

function polyline(samples: SquarePoint[], xOf: (t: number) => number, yOf: (v: number) => number, key: "vin" | "vout" | "vc" | "current"): string {
  return samples
    .map((sample) => {
      const x = xOf(sample.t);
      const y = yOf(sample[key]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
}

function currentDisplay(iMin: number, iMax: number): { scale: number; unit: string } {
  const peak = Math.max(Math.abs(iMin), Math.abs(iMax));
  if (peak >= 1) return { scale: 1, unit: "A" };
  if (peak >= 1e-3) return { scale: 1e3, unit: "mA" };
  if (peak >= 1e-6) return { scale: 1e6, unit: "µA" };
  return { scale: 1e9, unit: "nA" };
}

export function hpSquareScopeSvg(model: HpScopeModel): string {
  const W = 760;
  const H = 400;
  const padL = 58;
  const padR = model.showI ? 68 : 18;
  const padT = 22;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const tSpan = model.tEnd - model.tStart || 1;
  const ySpan = model.yMax - model.yMin || 1;
  const xOf = (t: number) => padL + ((t - model.tStart) / tSpan) * plotW;
  const yOf = (v: number) => padT + ((model.yMax - v) / ySpan) * plotH;

  let timeScale = 1;
  let timeUnit = "s";
  if (tSpan < 2e-3) {
    timeScale = 1e6;
    timeUnit = "µs";
  } else if (tSpan < 2) {
    timeScale = 1e3;
    timeUnit = "ms";
  }

  const grid: string[] = [];
  const labels: string[] = [];
  const t0 = model.tStart * timeScale;
  const t1 = model.tEnd * timeScale;
  const timeStep = niceStep(Math.abs(t1 - t0), 5);
  const firstTick = Math.ceil((t0 - 1e-9) / timeStep) * timeStep;
  for (let shown = firstTick; shown <= t1 + timeStep * 1e-6; shown += timeStep) {
    const t = shown / timeScale;
    if (t < model.tStart - 1e-9 || t > model.tEnd + 1e-9) continue;
    const x = xOf(t);
    grid.push(`<line x1="${x.toFixed(2)}" y1="${padT}" x2="${x.toFixed(2)}" y2="${padT + plotH}" class="grid"/>`);
    labels.push(`<text class="tick" x="${x.toFixed(2)}" y="${H - 18}" text-anchor="middle">${formatTick(shown, timeStep)}</text>`);
  }

  const yFirst = Math.ceil((model.yMin - 1e-9) / model.yStep) * model.yStep;
  let voltageZero = Number.NaN;
  if (model.yStep > 0) for (let v = yFirst; v <= model.yMax + model.yStep * 1e-6; v += model.yStep) {
    if (v < model.yMin - 1e-9 || v > model.yMax + 1e-9) continue;
    const y = yOf(v);
    const zero = Math.abs(v) < model.yStep * 1e-3;
    if (zero) voltageZero = y;
    grid.push(`<line x1="${padL}" y1="${y.toFixed(2)}" x2="${padL + plotW}" y2="${y.toFixed(2)}" class="${zero ? "zero" : "grid"}"/>`);
    labels.push(`<text class="tick" x="${padL - 8}" y="${y.toFixed(2)}" text-anchor="end" dy="4">${formatTick(v, model.yStep)}</text>`);
  }

  const iUnit = currentDisplay(model.iMin, model.iMax);
  if (model.showI) {
    const iSpan = model.iMax - model.iMin || 1;
    const yOfI = (amps: number) => padT + ((model.iMax - amps) / iSpan) * plotH;
    const iFirst = Math.ceil((model.iMin * iUnit.scale - 1e-9) / (model.iStep * iUnit.scale)) * (model.iStep * iUnit.scale);
    const iLast = model.iMax * iUnit.scale;
    const iStepShown = model.iStep * iUnit.scale;
    if (iStepShown > 0) for (let shown = iFirst; shown <= iLast + iStepShown * 1e-6; shown += iStepShown) {
      const amps = shown / iUnit.scale;
      if (amps < model.iMin - Math.abs(model.iStep) * 1e-6 || amps > model.iMax + Math.abs(model.iStep) * 1e-6) continue;
      const y = yOfI(amps);
      const zero = Math.abs(amps) < Math.abs(model.iStep) * 1e-3;
      if (zero && Math.abs(y - voltageZero) > 3) {
        grid.push(`<line x1="${padL}" y1="${y.toFixed(2)}" x2="${padL + plotW}" y2="${y.toFixed(2)}" class="i-zero"/>`);
      }
      labels.push(`<text class="tick i-tick" x="${padL + plotW + 8}" y="${y.toFixed(2)}" dy="4">${formatTick(shown, iStepShown)}</text>`);
    }
    labels.push(`<text class="axis-name i-tick" x="${W - 16}" y="${padT + plotH / 2}" text-anchor="middle" transform="rotate(90 ${W - 16} ${padT + plotH / 2})">current (${iUnit.unit})</text>`);
  }

  const yOfCurrent = (amps: number) => {
    const iSpan = model.iMax - model.iMin || 1;
    return padT + ((model.iMax - amps) / iSpan) * plotH;
  };

  const marks: string[] = [];
  for (const band of model.bands) {
    const x0 = xOf(Math.max(band.t0, model.tStart));
    const x1 = xOf(Math.min(band.t1, model.tEnd));
    if (x1 <= padL || x0 >= padL + plotW) continue;
    marks.push(`<rect x="${Math.max(x0, padL).toFixed(2)}" y="${padT}" width="${Math.max(0, Math.min(x1, padL + plotW) - Math.max(x0, padL)).toFixed(2)}" height="${plotH}" class="band"/>`);
  }
  for (const edge of model.edges) {
    if (edge.t < model.tStart || edge.t > model.tEnd) continue;
    const x = xOf(edge.t);
    marks.push(`<rect x="${(x - 5).toFixed(2)}" y="${padT}" width="10" height="${plotH}" class="edge-band"/>`);
    marks.push(`<line x1="${x.toFixed(2)}" y1="${padT}" x2="${x.toFixed(2)}" y2="${padT + plotH}" class="edge-line"/>`);
    const anchor = x > padL + plotW * 0.72 ? "end" : "start";
    const lx = anchor === "end" ? x - 6 : x + 6;
    marks.push(`<text class="edge-label" x="${lx.toFixed(2)}" y="${padT + 16}" text-anchor="${anchor}">${edge.label}</text>`);
  }
  for (const mark of model.tauMarks) {
    if (mark.t < model.tStart || mark.t > model.tEnd) continue;
    const x = xOf(mark.t);
    marks.push(`<line x1="${x.toFixed(2)}" y1="${padT}" x2="${x.toFixed(2)}" y2="${padT + plotH}" class="tau-mark"/>`);
    marks.push(`<text class="tau-label" x="${(x + 4).toFixed(2)}" y="${padT + 34}">${mark.label}</text>`);
  }

  const dots: string[] = [];
  const addDot = (sample: SquarePoint, key: "vin" | "vout" | "vc" | "current", cls: string, yFn: (v: number) => number) => {
    const x = xOf(sample.t);
    const y = yFn(sample[key]);
    if (sample.t < model.tStart || sample.t > model.tEnd) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" class="cursor-dot ${cls}"/>`);
  };
  let cursor = "";
  if (model.cursor && model.cursor.t >= model.tStart && model.cursor.t <= model.tEnd) {
    const x = xOf(model.cursor.t);
    cursor = `<line x1="${x.toFixed(2)}" y1="${padT}" x2="${x.toFixed(2)}" y2="${padT + plotH}" class="cursor"/>`;
    addDot(model.cursor, "vin", "in", yOf);
    addDot(model.cursor, "vout", "out", yOf);
    if (model.showVc) addDot(model.cursor, "vc", "vc", yOf);
    if (model.showI) addDot(model.cursor, "current", "i", yOfCurrent);
    if (model.cursorBefore) {
      addDot(model.cursorBefore, "vin", "in", yOf);
      addDot(model.cursorBefore, "vout", "out", yOf);
      if (model.showI) addDot(model.cursorBefore, "current", "i", yOfCurrent);
    }
  }

  const traces = [
    model.showVc ? `<polyline points="${polyline(model.samples, xOf, yOf, "vc")}" class="trace vc"/>` : "",
    `<polyline points="${polyline(model.samples, xOf, yOf, "vin")}" class="trace in"/>`,
    `<polyline points="${polyline(model.samples, xOf, yOf, "vout")}" class="trace out"/>`,
    model.showI ? `<polyline points="${polyline(model.samples, xOf, yOfCurrent, "current")}" class="trace i"/>` : "",
  ].join("");

  return `
    <svg class="scope" viewBox="0 0 ${W} ${H}" data-vb="${W}" data-pad-l="${padL}" data-plot-w="${plotW}" data-t0="${model.tStart}" data-t1="${model.tEnd}" role="img" aria-label="Input and output of the high-pass filter for a square wave. Blue is the input and orange is the output. Both use the voltage axis.">
      <rect class="scope-bg" x="0" y="0" width="${W}" height="${H}" rx="12"/>
      ${grid.join("")}
      <defs>
        <clipPath id="hp-scope-clip">
          <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}"/>
        </clipPath>
      </defs>
      <g clip-path="url(#hp-scope-clip)">
        ${marks.join("")}
        ${traces}
        ${cursor}
        ${dots.join("")}
      </g>
      ${labels.join("")}
      <text class="axis-name" x="${padL + plotW / 2}" y="${H - 4}" text-anchor="middle">time (${timeUnit})</text>
      <text class="axis-name" x="16" y="${padT + plotH / 2}" text-anchor="middle" transform="rotate(-90 16 ${padT + plotH / 2})">voltage (V)</text>
    </svg>
  `;
}
