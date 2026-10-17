import { niceStep, niceY } from "./draw.ts";
import { formatTick } from "./format.ts";
import type { FilterKind, TracePoint } from "./pulseExamples.ts";

export interface PlotMarker {
  t: number;
  label: string;
  kind: "switch" | "request" | "max";
}

export interface PlotNote {
  t: number;
  voltage: number;
  lines: string[];
}

export interface PlotLayout {
  width: number;
  height: number;
  padL: number;
  padT: number;
  plotW: number;
  plotH: number;
  tStart: number;
  tEnd: number;
  yMin: number;
  yMax: number;
}

export interface DrawnPlot {
  svg: string;
  layout: PlotLayout;
}

interface Frame {
  layout: PlotLayout;
  xOf: (t: number) => number;
  yOf: (v: number) => number;
  grid: string;
}

function frame(tStart: number, tEnd: number, yMin: number, yMax: number, yStep: number, width: number, height: number): Frame {
  const padL = 64;
  const padR = 18;
  const padT = 34;
  const padB = 48;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const tSpan = tEnd - tStart || 1;
  const ySpan = yMax - yMin || 1;
  const xOf = (t: number) => padL + ((t - tStart) / tSpan) * plotW;
  const yOf = (v: number) => padT + ((yMax - v) / ySpan) * plotH;
  const grid: string[] = [];
  const labels: string[] = [];
  const t0ms = tStart * 1000;
  const t1ms = tEnd * 1000;
  const timeStep = niceStep(Math.abs(t1ms - t0ms), 5);
  const firstTick = Math.ceil((t0ms - 1e-9) / timeStep) * timeStep;
  for (let ms = firstTick; ms <= t1ms + timeStep * 1e-6; ms += timeStep) {
    const t = ms / 1000;
    if (t < tStart - 1e-9 || t > tEnd + 1e-9) continue;
    const x = xOf(t);
    grid.push(`<line x1="${x.toFixed(2)}" y1="${padT}" x2="${x.toFixed(2)}" y2="${padT + plotH}" class="grid"/>`);
    labels.push(`<text class="tick" x="${x.toFixed(2)}" y="${height - 18}" text-anchor="middle">${formatTick(ms, timeStep)}</text>`);
  }
  const yFirst = Math.ceil((yMin - 1e-9) / yStep) * yStep;
  for (let v = yFirst; v <= yMax + yStep * 1e-6; v += yStep) {
    if (v < yMin - 1e-9 || v > yMax + 1e-9) continue;
    const y = yOf(v);
    const zero = Math.abs(v) < yStep * 1e-3;
    grid.push(`<line x1="${padL}" y1="${y.toFixed(2)}" x2="${padL + plotW}" y2="${y.toFixed(2)}" class="${zero ? "zero" : "grid"}"/>`);
    labels.push(`<text class="tick" x="${padL - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end">${formatTick(v, yStep)}</text>`);
  }
  return {
    layout: { width, height, padL, padT, plotW, plotH, tStart, tEnd, yMin, yMax },
    xOf,
    yOf,
    grid: `${grid.join("")}${labels.join("")}`,
  };
}

function yRange(values: number[]): { min: number; max: number; step: number } {
  let min = 0;
  let max = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return niceY(min, max);
}

function markerLines(markers: PlotMarker[], xOf: (t: number) => number, padT: number, plotH: number, tStart: number, tEnd: number): string {
  const used: number[] = [];
  return markers
    .filter((marker) => marker.t >= tStart - 1e-9 && marker.t <= tEnd + 1e-9)
    .map((marker) => {
      const x = xOf(marker.t);
      let slot = 0;
      while (used.some((prev) => Math.abs(prev - x) < 72 && used.indexOf(prev) % 3 === slot)) slot += 1;
      used.push(x);
      const y = padT + 14 + (slot % 3) * 14;
      const anchor = x > tStart && xOf(tEnd) - x < 70 ? "end" : "start";
      return `<line x1="${x.toFixed(2)}" y1="${padT}" x2="${x.toFixed(2)}" y2="${padT + plotH}" class="mark ${marker.kind}"/>
        <text class="mark-label ${marker.kind}" x="${(x + (anchor === "end" ? -4 : 4)).toFixed(2)}" y="${y}" text-anchor="${anchor}">${marker.label}</text>`;
    })
    .join("");
}

function noteText(notes: PlotNote[], xOf: (t: number) => number, yOf: (v: number) => number, layout: PlotLayout): string {
  const placed: { x: number; y: number }[] = [];
  return notes
    .map((note) => {
      if (note.t < layout.tStart || note.t > layout.tEnd) return "";
      const x = xOf(note.t);
      let y = yOf(note.voltage) - 12;
      if (y < layout.padT + 18) y = yOf(note.voltage) + 16;
      while (placed.some((prev) => Math.abs(prev.x - x) < 78 && Math.abs(prev.y - y) < 16)) y += 16;
      placed.push({ x, y });
      const lines = note.lines
        .map((line, index) => `<tspan x="${x.toFixed(2)}" dy="${index === 0 ? 0 : 14}">${line}</tspan>`)
        .join("");
      return `<text class="value-label" x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle">${lines}</text>`;
    })
    .join("");
}

export function extents(samples: TracePoint[], filter: FilterKind, includeOutput: boolean): { min: number; max: number; step: number } {
  const values: number[] = [];
  for (const sample of samples) {
    values.push(sample.vin);
    if (includeOutput) values.push(filter === "lp" ? sample.lp : sample.hp);
  }
  return yRange(values);
}

function keep(point: TracePoint, until: { t: number; order: number } | null): boolean {
  if (!until) return true;
  if (point.t < until.t - 1e-12) return true;
  return Math.abs(point.t - until.t) <= 1e-9 && point.order <= until.order;
}

function tracePoints(samples: TracePoint[], key: "vin" | "lp" | "hp", xOf: (t: number) => number, yOf: (v: number) => number, until: { t: number; order: number } | null): string {
  return samples
    .filter((sample) => keep(sample, until))
    .map((sample) => `${xOf(sample.t).toFixed(2)},${yOf(sample[key]).toFixed(2)}`)
    .join(" ");
}

export function responseGraph(model: {
  samples: TracePoint[];
  tStart: number;
  tEnd: number;
  filter: FilterKind;
  showInput: boolean;
  showOutput: boolean;
  until: { t: number; order: number } | null;
  highlight: { t0: number; t1: number } | null;
  markers: PlotMarker[];
  notes: PlotNote[];
  emptyMessage: string | null;
  aria: string;
}): DrawnPlot {
  const y = extents(model.samples, model.filter, true);
  const width = 760;
  const height = 400;
  const plot = frame(model.tStart, model.tEnd, y.min, y.max, y.step, width, height);
  const { xOf, yOf, layout } = plot;
  const key = model.filter === "lp" ? "lp" : "hp";
  const clip = "clip-ex-out";
  let highlight = "";
  if (model.highlight) {
    const t0 = Math.max(model.tStart, model.highlight.t0);
    const t1 = Math.min(model.tEnd, model.highlight.t1);
    if (t1 > t0) {
      highlight = `<rect class="band" x="${xOf(t0).toFixed(2)}" y="${layout.padT}" width="${(xOf(t1) - xOf(t0)).toFixed(2)}" height="${layout.plotH}"/>`;
    }
  }
  const input = model.showInput ? `<polyline points="${tracePoints(model.samples, "vin", xOf, yOf, model.until)}" class="trace in" clip-path="url(#${clip})"/>` : "";
  const output = model.showOutput ? `<polyline points="${tracePoints(model.samples, key, xOf, yOf, model.until)}" class="trace out" clip-path="url(#${clip})"/>` : "";
  const empty = model.emptyMessage
    ? `<text class="empty-note" x="${(layout.padL + layout.plotW / 2).toFixed(2)}" y="${(layout.padT + layout.plotH / 2).toFixed(2)}" text-anchor="middle">${model.emptyMessage}</text>`
    : "";
  const svg = `
    <svg class="scope" viewBox="0 0 ${width} ${height}" role="img" aria-label="${model.aria}">
      <rect class="scope-bg" x="0" y="0" width="${width}" height="${height}" rx="12"/>
      <clipPath id="${clip}"><rect x="${layout.padL}" y="${layout.padT}" width="${layout.plotW}" height="${layout.plotH}"/></clipPath>
      ${plot.grid}
      ${highlight}
      ${markerLines(model.markers, xOf, layout.padT, layout.plotH, model.tStart, model.tEnd)}
      ${input}
      ${output}
      ${noteText(model.notes, xOf, yOf, layout)}
      ${empty}
      <g class="hover-layer" visibility="hidden">
        <line class="cursor" y1="${layout.padT}" y2="${layout.padT + layout.plotH}"/>
        <circle class="cursor-dot in" r="4.5"/>
        <circle class="cursor-dot out" r="4.5"/>
      </g>
      <text class="axis-name" x="${layout.padL + layout.plotW / 2}" y="${height - 2}" text-anchor="middle">time (ms)</text>
      <text class="axis-name" x="16" y="${layout.padT + layout.plotH / 2}" text-anchor="middle" transform="rotate(-90 16 ${layout.padT + layout.plotH / 2})">voltage (V)</text>
    </svg>`;
  return { svg, layout };
}

export function inputGraph(model: {
  samples: TracePoint[];
  tStart: number;
  tEnd: number;
  levels: { t0: number; t1: number; voltage: number }[];
  highlight: { t0: number; t1: number } | null;
  markers: PlotMarker[];
  aria: string;
}): DrawnPlot {
  const y = extents(model.samples, "lp", false);
  const width = 760;
  const height = 280;
  const plot = frame(model.tStart, model.tEnd, y.min, y.max, y.step, width, height);
  const { xOf, yOf, layout } = plot;
  const clip = "clip-ex-in";
  let highlight = "";
  if (model.highlight) {
    const t0 = Math.max(model.tStart, model.highlight.t0);
    const t1 = Math.min(model.tEnd, model.highlight.t1);
    if (t1 > t0) highlight = `<rect class="band" x="${xOf(t0).toFixed(2)}" y="${layout.padT}" width="${(xOf(t1) - xOf(t0)).toFixed(2)}" height="${layout.plotH}"/>`;
  }
  const labels = model.levels
    .map((level) => {
      const t0 = Math.max(model.tStart, level.t0);
      const t1 = Math.min(model.tEnd, level.t1);
      if (t1 - t0 <= 0) return "";
      const x0 = xOf(t0);
      const x1 = xOf(t1);
      if (x1 - x0 < 46) return "";
      const y = Math.max(layout.padT + 16, Math.min(layout.padT + layout.plotH - 8, yOf(level.voltage) - 10));
      return `<text class="level-label" x="${((x0 + x1) / 2).toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle">${formatTick(level.voltage, 0.001)} V</text>`;
    })
    .join("");
  const svg = `
    <svg class="scope" viewBox="0 0 ${width} ${height}" role="img" aria-label="${model.aria}">
      <rect class="scope-bg" x="0" y="0" width="${width}" height="${height}" rx="12"/>
      <clipPath id="${clip}"><rect x="${layout.padL}" y="${layout.padT}" width="${layout.plotW}" height="${layout.plotH}"/></clipPath>
      ${plot.grid}
      ${highlight}
      ${markerLines(model.markers, xOf, layout.padT, layout.plotH, model.tStart, model.tEnd)}
      <polyline points="${tracePoints(model.samples, "vin", xOf, yOf, null)}" class="trace in" clip-path="url(#${clip})"/>
      ${labels}
      <g class="hover-layer" visibility="hidden">
        <line class="cursor" y1="${layout.padT}" y2="${layout.padT + layout.plotH}"/>
        <circle class="cursor-dot in" r="4.5"/>
      </g>
      <text class="axis-name" x="${layout.padL + layout.plotW / 2}" y="${height - 2}" text-anchor="middle">time (ms)</text>
      <text class="axis-name" x="16" y="${layout.padT + layout.plotH / 2}" text-anchor="middle" transform="rotate(-90 16 ${layout.padT + layout.plotH / 2})">voltage (V)</text>
    </svg>`;
  return { svg, layout };
}

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

export function pulseCircuitSvg(filter: FilterKind, rLabel: string, cLabel: string, vcLabel: string): string {
  const yTop = 64;
  const yGnd = 188;
  const xSrc = 86;
  const xNode = 392;
  const srcR = 30;
  const srcCy = 124;
  const pulse = `<path d="M 18 ${srcCy + 28} H 28 V ${srcCy + 14} H 44 V ${srcCy + 28} H 58" class="wave-icon"/>`;
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
    <text class="term" x="16" y="${srcCy - 8}">Vin</text>
    ${pulse}
  `;
  const outputName = filter === "lp" ? "across C" : "across R";
  const output = `
    <circle cx="${xNode}" cy="${yTop}" r="4.5" class="joint out"/>
    <line x1="${xNode}" y1="${yTop}" x2="${xNode + 36}" y2="${yTop}" class="wire out-lead"/>
    <text class="term out-label" x="${xNode + 42}" y="${yTop + 5}">Vo</text>
    <text class="part-label" x="${xNode + 42}" y="${yTop + 24}">${outputName}</text>
  `;
  let series = "";
  let shunt = "";
  if (filter === "lp") {
    series = `
      <line x1="${xSrc}" y1="${yTop}" x2="150" y2="${yTop}" class="wire"/>
      <path d="${hResistor(150, 300, yTop)}" class="part"/>
      <line x1="300" y1="${yTop}" x2="${xNode}" y2="${yTop}" class="wire"/>
      <text class="part-label" x="225" y="${yTop - 18}" text-anchor="middle">R = ${rLabel}</text>
    `;
    shunt = `
      <line x1="${xNode}" y1="${yTop}" x2="${xNode}" y2="112" class="wire"/>
      <line x1="${xNode - 20}" y1="112" x2="${xNode + 20}" y2="112" class="part"/>
      <line x1="${xNode - 20}" y1="128" x2="${xNode + 20}" y2="128" class="part"/>
      <line x1="${xNode}" y1="128" x2="${xNode}" y2="${yGnd}" class="wire"/>
      <text class="part-label" x="${xNode + 28}" y="126">C = ${cLabel}</text>
      <text class="part-label" x="230" y="150" text-anchor="middle">${vcLabel}</text>
    `;
  } else {
    series = `
      <line x1="${xSrc}" y1="${yTop}" x2="168" y2="${yTop}" class="wire"/>
      <line x1="168" y1="${yTop - 18}" x2="168" y2="${yTop + 18}" class="part"/>
      <line x1="190" y1="${yTop - 18}" x2="190" y2="${yTop + 18}" class="part"/>
      <line x1="190" y1="${yTop}" x2="${xNode}" y2="${yTop}" class="wire"/>
      <text class="part-label" x="179" y="${yTop - 26}" text-anchor="middle">C = ${cLabel}</text>
      <text class="part-label" x="250" y="${yTop + 36}">${vcLabel}</text>
    `;
    shunt = `
      <path d="${vResistor(xNode, yTop, yGnd)}" class="part"/>
      <text class="part-label" x="${xNode + 16}" y="140">R = ${rLabel}</text>
    `;
  }
  const topology = filter === "lp" ? "Low-pass" : "High-pass";
  return `
    <svg class="schematic" viewBox="0 0 560 240" role="img" aria-label="${topology} RC pulse circuit. R is ${rLabel}, C is ${cLabel}, ${vcLabel}. Output is ${outputName}.">
      ${ground}
      ${source}
      ${series}
      ${output}
      ${shunt}
    </svg>
  `;
}
