import { hpSquareCircuitSvg, hpSquareScopeSvg, zoomAround } from "./draw.ts";
import {
  formatAmps,
  formatFactor,
  formatFarads,
  formatHz,
  formatLessonVolts,
  formatOhms,
  formatSeconds,
  inputString,
} from "./format.ts";
import { cutoffFrequency } from "./sim.ts";
import {
  isWorkedExample,
  formatCircuitTime,
  lessonHtml,
  periodicCorners,
  squareFacts,
  squareLimits,
  squareSamples,
  stageHtml,
  WORKED_EXAMPLE,
  type CycleStage,
  type SquareMode,
  type SquareParams,
} from "./square.ts";

const R_MIN = 10;
const R_MAX = 1_000_000;
const C_MIN = 1e-9;
const C_MAX = 10e-6;
const F_MIN = 0.1;
const F_MAX = 1_000_000;
const P_MAX = 8;
const P_MIN = 0.35;

type RUnit = "ohm" | "kohm";
type CUnit = "nF" | "uF";
type FUnit = "Hz" | "kHz";

const state = {
  R: WORKED_EXAMPLE.resistance,
  C: WORKED_EXAMPLE.capacitance,
  freq: WORKED_EXAMPLE.frequency,
  amplitude: WORKED_EXAMPLE.amplitude,
  offset: WORKED_EXAMPLE.offset,
  mode: "periodic" as SquareMode,
  stage: "rise" as CycleStage,
  playing: false,
  cursor: 0,
  startPeriods: 0,
  periods: 3,
  voltZoom: 1,
  showVc: false,
  showI: false,
  rUnit: "kohm" as RUnit,
  cUnit: "nF" as CUnit,
  fUnit: "Hz" as FUnit,
};

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as unknown as T;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function sliderFromLog(value: number, min: number, max: number) {
  const v = clamp(value, min, max);
  return (1000 * Math.log(v / min)) / Math.log(max / min);
}

function logFromSlider(slider: number, min: number, max: number) {
  return min * Math.pow(max / min, slider / 1000);
}

function periodsFromSlider(slider: number) {
  return P_MAX * Math.pow(P_MIN / P_MAX, clamp(slider, 0, 1000) / 1000);
}

function sliderFromPeriods(periods: number) {
  const value = clamp(periods, P_MIN, P_MAX);
  return (1000 * Math.log(value / P_MAX)) / Math.log(P_MIN / P_MAX);
}

function zoomFromSlider(slider: number) {
  return Math.pow(8, clamp(slider, 0, 1000) / 1000);
}

function sliderFromZoom(zoom: number) {
  return (1000 * Math.log(clamp(zoom, 1, 8))) / Math.log(8);
}

function rScale() { return state.rUnit === "kohm" ? 1000 : 1; }
function cScale() { return state.cUnit === "uF" ? 1e-6 : 1e-9; }
function fScale() { return state.fUnit === "kHz" ? 1000 : 1; }

function writeNumber(input: HTMLInputElement, value: number, scale: number) {
  if (document.activeElement === input) return;
  input.value = inputString(value, scale);
}

function writeSlider(slider: HTMLInputElement, value: number) {
  if (document.activeElement === slider) return;
  slider.value = String(value);
}

function params(): SquareParams {
  return {
    resistance: state.R,
    capacitance: state.C,
    frequency: state.freq,
    amplitude: state.amplitude,
    offset: state.offset,
  };
}

function viewWindow() {
  const period = 1 / state.freq;
  const t0 = Math.max(0, state.startPeriods) * period;
  const t1 = t0 + state.periods * period;
  return { t0, t1, period };
}

function clampCursor() {
  const { t0, t1 } = viewWindow();
  state.cursor = clamp(state.cursor, t0, t1);
}

function cycleStartOf(t: number, period: number) {
  const raw = Math.floor(t / period + 1e-10) * period;
  return state.mode === "startup" ? Math.max(0, raw) : raw;
}

const rSlider = $<HTMLInputElement>("sq-r-slider");
const rNumber = $<HTMLInputElement>("sq-r-number");
const rUnit = $<HTMLSelectElement>("sq-r-unit");
const cSlider = $<HTMLInputElement>("sq-c-slider");
const cNumber = $<HTMLInputElement>("sq-c-number");
const cUnit = $<HTMLSelectElement>("sq-c-unit");
const fSlider = $<HTMLInputElement>("sq-f-slider");
const fNumber = $<HTMLInputElement>("sq-f-number");
const fUnit = $<HTMLSelectElement>("sq-f-unit");
const aSlider = $<HTMLInputElement>("sq-a-slider");
const aNumber = $<HTMLInputElement>("sq-a-number");
const oSlider = $<HTMLInputElement>("sq-o-slider");
const oNumber = $<HTMLInputElement>("sq-o-number");
const timeSlider = $<HTMLInputElement>("sq-time-zoom");
const voltSlider = $<HTMLInputElement>("sq-volt-zoom");
const startSlider = $<HTMLInputElement>("sq-start");
const playBtn = $<HTMLButtonElement>("sq-play");
const scopeHost = $("sq-scope");

function syncControls() {
  writeSlider(rSlider, sliderFromLog(state.R, R_MIN, R_MAX));
  writeSlider(cSlider, sliderFromLog(state.C, C_MIN, C_MAX));
  writeSlider(fSlider, sliderFromLog(state.freq, F_MIN, F_MAX));
  writeSlider(aSlider, state.amplitude);
  writeSlider(oSlider, state.offset);
  writeSlider(timeSlider, sliderFromPeriods(state.periods));
  writeSlider(voltSlider, sliderFromZoom(state.voltZoom));
  writeSlider(startSlider, state.startPeriods);
  writeNumber(rNumber, state.R, rScale());
  writeNumber(cNumber, state.C, cScale());
  writeNumber(fNumber, state.freq, fScale());
  writeNumber(aNumber, state.amplitude, 1);
  writeNumber(oNumber, state.offset, 1);
  rUnit.value = state.rUnit;
  cUnit.value = state.cUnit;
  fUnit.value = state.fUnit;
  const mode = document.querySelector<HTMLInputElement>(`input[name="sq-mode"][value="${state.mode}"]`);
  if (mode) mode.checked = true;
  const stage = document.querySelector<HTMLInputElement>(`input[name="sq-stage"][value="${state.stage}"]`);
  if (stage) stage.checked = true;
  $<HTMLInputElement>("sq-show-vc").checked = state.showVc;
  $<HTMLInputElement>("sq-show-i").checked = state.showI;
}

function paintChrome(facts = squareFacts(params())) {
  const corners = periodicCorners(facts);
  $("sq-tau").textContent = formatSeconds(facts.tau);
  $("sq-fc").textContent = formatHz(facts.fc);
  $("sq-T").textContent = formatSeconds(facts.period);
  $("sq-h").textContent = formatSeconds(facts.half);
  $("sq-vh").textContent = formatLessonVolts(facts.high);
  $("sq-vl").textContent = formatLessonVolts(facts.low);
  $("sq-jump").textContent = `±${formatLessonVolts(facts.jump)}`;
  $("sq-ratio").textContent = Math.abs(facts.halfOverTau - Math.PI) < 1e-3 ? "π" : formatFactor(facts.halfOverTau);
  $("sq-tau").dataset.value = String(facts.tau);
  $("sq-fc").dataset.value = String(facts.fc);
  $("sq-T").dataset.value = String(facts.period);
  $("sq-h").dataset.value = String(facts.half);
  $("sq-vh").dataset.value = String(facts.high);
  $("sq-vl").dataset.value = String(facts.low);
  $("sq-jump").dataset.value = String(facts.jump);
  $("sq-ratio").dataset.value = String(facts.halfOverTau);

  const stat = (id: string, value: number) => {
    const el = $(id);
    el.textContent = formatLessonVolts(value, true);
    el.dataset.value = String(value);
  };
  stat("sq-g-rise", corners.afterRise);
  stat("sq-g-before-fall", corners.beforeFall);
  stat("sq-g-fall", corners.afterFall);
  stat("sq-g-before-rise", corners.beforeRise);

  const identity = $("sq-identity");
  identity.dataset.k = String(facts.k);
  identity.dataset.b = String(facts.B);
  identity.dataset.bk = String(corners.beforeFall);
  identity.dataset.tau = String(facts.tau);
  identity.dataset.fc = String(facts.fc);
  identity.textContent =
    `k = ${formatFactor(facts.k)}    B = ${formatLessonVolts(facts.B)}    ` +
    `+Bk − 2A = ${formatLessonVolts(corners.beforeFall - facts.jump, true)} = −B    ` +
    `−Bk + 2A = ${formatLessonVolts(corners.beforeRise + facts.jump, true)} = +B`;

  $("sq-stats-note").textContent = state.mode === "periodic"
    ? "These four corners repeat every cycle in periodic steady state. The plateau starts at ±B, which already includes the voltage left from the previous half-cycle."
    : "These are the periodic corners. This graph is the startup transient, so the first cycle begins at VH instead of +B. Later edges still jump by ±2A.";

  $("sq-time-label").textContent = `showing ${formatFactor(state.periods)} periods`;
  $("sq-volt-label").textContent = state.voltZoom <= 1.05 ? "fit" : `${formatFactor(state.voltZoom)}×`;
  $("sq-start-label").textContent = `starts at ${formatCircuitTime(state.startPeriods / state.freq, 1 / state.freq)}`;

  const fc = facts.fc;
  for (const id of ["sq-pre-low", "sq-pre-mid", "sq-pre-high"]) {
    const btn = $<HTMLButtonElement>(id);
    const factor = Number(btn.dataset.factor);
    const active = Math.abs(state.freq - factor * fc) / fc < 0.02;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }
  $<HTMLButtonElement>("sq-worked").setAttribute("aria-pressed", isWorkedExample(params()) && state.mode === "periodic" ? "true" : "false");
  playBtn.textContent = state.playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", state.playing ? "true" : "false");
}

let stageKey = "";

function paintStage(facts = squareFacts(params())) {
  const { period } = viewWindow();
  const cycle = cycleStartOf(state.cursor, period);
  const key = [
    state.mode,
    state.stage,
    cycle.toPrecision(8),
    facts.tau,
    facts.period,
    facts.high,
    facts.low,
    facts.B,
  ].join("|");
  if (key === stageKey) return;
  stageKey = key;
  $("sq-stage-copy").innerHTML = stageHtml(params(), state.mode, state.stage, cycle);
}

function paintScope() {
  const input = params();
  const facts = squareFacts(input);
  const { t0, t1, period } = viewWindow();
  const samples = squareSamples(input, state.mode, t0, t1);
  let min = 0;
  let max = 0;
  let iMin = 0;
  let iMax = 0;
  let clipped = false;
  for (const sample of samples) {
    min = Math.min(min, sample.vin, sample.vout);
    max = Math.max(max, sample.vin, sample.vout);
    if (state.showVc) {
      min = Math.min(min, sample.vc);
      max = Math.max(max, sample.vc);
    }
    iMin = Math.min(iMin, sample.current);
    iMax = Math.max(iMax, sample.current);
  }
  const y = zoomAround(min, max, state.voltZoom);
  const iAxis = zoomAround(iMin, iMax, 1);
  for (const sample of samples) {
    if (sample.vin < y.min || sample.vin > y.max || sample.vout < y.min || sample.vout > y.max) clipped = true;
    if (state.showVc && (sample.vc < y.min || sample.vc > y.max)) clipped = true;
  }

  const cycle = cycleStartOf(state.cursor, period);
  const half = facts.half;
  const bands = [];
  const edges = [];
  const tauMarks = [];
  if (state.stage === "high") bands.push({ t0: cycle, t1: cycle + half });
  if (state.stage === "low") bands.push({ t0: cycle + half, t1: cycle + period });
  if (state.stage === "rise") {
    const label = state.mode === "startup" && cycle <= facts.period * 1e-6 ? "start" : "rising edge";
    edges.push({ t: cycle, label });
  }
  if (state.stage === "fall") edges.push({ t: cycle + half, label: "falling edge" });
  const tauFits = facts.tau < half * 0.995;
  if (tauFits && (state.stage === "rise" || state.stage === "high")) tauMarks.push({ t: cycle + facts.tau, label: "τ" });
  if (tauFits && (state.stage === "fall" || state.stage === "low")) tauMarks.push({ t: cycle + half + facts.tau, label: "τ" });

  const limits = squareLimits(input, state.mode, state.cursor, (t1 - t0) / 180);
  scopeHost.innerHTML = hpSquareScopeSvg({
    samples,
    tStart: t0,
    tEnd: t1,
    yMin: y.min,
    yMax: y.max,
    yStep: y.step,
    showVc: state.showVc,
    showI: state.showI,
    iMin: iAxis.min,
    iMax: iAxis.max,
    iStep: iAxis.step,
    cursor: limits.after,
    cursorBefore: limits.jumped ? limits.before : null,
    bands,
    edges,
    tauMarks,
  });

  const read = $("sq-readout");
  const after = limits.after;
  read.dataset.t = String(after.t);
  read.dataset.vin = String(after.vin);
  read.dataset.vout = String(after.vout);
  read.dataset.vc = String(after.vc);
  read.dataset.i = String(after.current);
  read.dataset.jumped = limits.jumped ? "1" : "0";
  if (limits.jumped && limits.edge && limits.tEdge !== null) {
    const name = limits.edge === "rise" ? "Rising edge" : "Falling edge";
    const before = limits.before;
    read.textContent =
      `${name} at t = ${formatCircuitTime(limits.tEdge, period)}. ` +
      `Just before: Vin ${formatLessonVolts(before.vin)}, Vout ${formatLessonVolts(before.vout)}, VC ${formatLessonVolts(before.vc)}, I ${formatAmps(before.current)}. ` +
      `Just after: Vin ${formatLessonVolts(after.vin)}, Vout ${formatLessonVolts(after.vout)}, VC ${formatLessonVolts(after.vc)}, I ${formatAmps(after.current)}. ` +
      `VC stays the same. Vout changes by ${formatLessonVolts(after.vout - before.vout, true)}.`;
  } else {
    let s = after.t - period * Math.floor(after.t / period);
    if (s < 0) s += period;
    read.textContent =
      `t = ${formatCircuitTime(after.t, period)} · s = ${formatCircuitTime(s, period)} since the rising edge · ` +
      `Vin = ${formatLessonVolts(after.vin)} · Vout = ${formatLessonVolts(after.vout)} · ` +
      `VC = ${formatLessonVolts(after.vc)} · I = ${formatAmps(after.current)}`;
  }

  const scale = $("sq-scale-note");
  const parts = [
    "Blue input and orange output use the same voltage axis. Nothing is scaled to look the same size.",
  ];
  if (state.showVc) parts.push("Capacitor voltage uses that same voltage axis.");
  if (state.showI) parts.push("Current uses the gold scale on the right.");
  if (clipped) parts.push("Voltage zoom is clipping part of a trace. Lower the zoom to see the peaks.");
  if (!tauFits) parts.push("One time constant does not fit before the next edge, so the decay is interrupted and there is no τ mark.");
  scale.textContent = parts.join(" ");

  paintStage(facts);
  writeSlider(startSlider, state.startPeriods);
  $("sq-start-label").textContent = `starts at ${formatCircuitTime(state.startPeriods / state.freq, 1 / state.freq)}`;
}

function paintFull() {
  stageKey = "";
  clampCursor();
  syncControls();
  const input = params();
  const facts = squareFacts(input);
  paintChrome(facts);
  $("sq-circuit").innerHTML = hpSquareCircuitSvg(formatOhms(state.R), formatFarads(state.C));
  $("sq-lesson").innerHTML = lessonHtml(input, state.mode);
  paintScope();
}

let raf = 0;
let last = 0;

function frame(now: number) {
  if (!state.playing) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  const { t0, t1, period } = viewWindow();
  state.cursor += (dt * period) / 3;
  if (state.cursor > t1) {
    if (state.mode === "periodic") {
      const span = t1 - t0;
      state.cursor = t0 + ((state.cursor - t0) % span);
    } else {
      state.startPeriods += state.periods * 0.5;
      if (state.startPeriods > 40) {
        state.startPeriods = 0;
        state.cursor = 0;
      }
    }
  }
  clampCursor();
  paintScope();
  raf = requestAnimationFrame(frame);
}

function setPlaying(playing: boolean) {
  state.playing = playing;
  playBtn.textContent = playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
  if (raf) cancelAnimationFrame(raf);
  if (playing) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  } else {
    paintFull();
  }
}

function parseField(input: HTMLInputElement, scale: number, min: number, max: number): number | null {
  const raw = Number(input.value);
  if (!Number.isFinite(raw)) return null;
  return clamp(raw * scale, min, max);
}

function reveal(t: number) {
  const { t0, t1, period } = viewWindow();
  if (t >= t0 - period * 1e-9 && t <= t1 + period * 1e-9) return;
  state.startPeriods = clamp(t / period - state.periods * 0.15, 0, 40);
}

function focusStage(stage: CycleStage) {
  state.stage = stage;
  const input = params();
  const facts = squareFacts(input);
  const { period } = viewWindow();
  const cycle = cycleStartOf(state.cursor, period);
  const half = period / 2;
  const along = Math.min(half * 0.25, Math.max(facts.tau * 0.35, half * 0.08));
  let t = cycle;
  if (stage === "high") t = cycle + along;
  if (stage === "fall") t = cycle + half;
  if (stage === "low") t = cycle + half + along;
  reveal(t);
  state.cursor = t;
  clampCursor();
  if (state.playing) setPlaying(false);
  else paintFull();
}

function timeFromPointer(event: PointerEvent): number | null {
  const svg = scopeHost.querySelector("svg");
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  if (!(rect.width > 0)) return null;
  const vb = Number(svg.dataset.vb);
  const padL = Number(svg.dataset.padL);
  const plotW = Number(svg.dataset.plotW);
  const t0 = Number(svg.dataset.t0);
  const t1 = Number(svg.dataset.t1);
  const x = ((event.clientX - rect.left) / rect.width) * vb;
  const frac = (x - padL) / plotW;
  if (frac < -0.08 || frac > 1.08) return null;
  return t0 + clamp(frac, 0, 1) * (t1 - t0);
}

export function initSquarePage() {
  rSlider.addEventListener("input", () => {
    state.R = logFromSlider(Number(rSlider.value), R_MIN, R_MAX);
    writeNumber(rNumber, state.R, rScale());
    paintFull();
  });
  cSlider.addEventListener("input", () => {
    state.C = logFromSlider(Number(cSlider.value), C_MIN, C_MAX);
    writeNumber(cNumber, state.C, cScale());
    paintFull();
  });
  fSlider.addEventListener("input", () => {
    state.freq = logFromSlider(Number(fSlider.value), F_MIN, F_MAX);
    writeNumber(fNumber, state.freq, fScale());
    clampCursor();
    paintFull();
  });
  aSlider.addEventListener("input", () => {
    state.amplitude = Number(aSlider.value);
    writeNumber(aNumber, state.amplitude, 1);
    paintFull();
  });
  oSlider.addEventListener("input", () => {
    state.offset = Number(oSlider.value);
    writeNumber(oNumber, state.offset, 1);
    paintFull();
  });

  rNumber.addEventListener("input", () => {
    const next = parseField(rNumber, rScale(), R_MIN, R_MAX);
    if (next === null) return;
    state.R = next;
    writeSlider(rSlider, sliderFromLog(state.R, R_MIN, R_MAX));
    paintFull();
  });
  cNumber.addEventListener("input", () => {
    const next = parseField(cNumber, cScale(), C_MIN, C_MAX);
    if (next === null) return;
    state.C = next;
    writeSlider(cSlider, sliderFromLog(state.C, C_MIN, C_MAX));
    paintFull();
  });
  fNumber.addEventListener("input", () => {
    const next = parseField(fNumber, fScale(), F_MIN, F_MAX);
    if (next === null) return;
    state.freq = next;
    writeSlider(fSlider, sliderFromLog(state.freq, F_MIN, F_MAX));
    clampCursor();
    paintFull();
  });

  const commitLinear = (input: HTMLInputElement, min: number, max: number, assign: (value: number) => void, slider: HTMLInputElement) => {
    const next = parseField(input, 1, min, max);
    if (next === null) return;
    assign(next);
    writeSlider(slider, next);
    paintFull();
  };
  aNumber.addEventListener("input", () => commitLinear(aNumber, 0, 20, (value) => { state.amplitude = value; }, aSlider));
  oNumber.addEventListener("input", () => commitLinear(oNumber, -20, 20, (value) => { state.offset = value; }, oSlider));
  aNumber.addEventListener("change", () => writeNumber(aNumber, state.amplitude, 1));
  oNumber.addEventListener("change", () => writeNumber(oNumber, state.offset, 1));
  rNumber.addEventListener("change", () => writeNumber(rNumber, state.R, rScale()));
  cNumber.addEventListener("change", () => writeNumber(cNumber, state.C, cScale()));
  fNumber.addEventListener("change", () => writeNumber(fNumber, state.freq, fScale()));

  rUnit.addEventListener("change", () => {
    state.rUnit = rUnit.value as RUnit;
    writeNumber(rNumber, state.R, rScale());
  });
  cUnit.addEventListener("change", () => {
    state.cUnit = cUnit.value as CUnit;
    writeNumber(cNumber, state.C, cScale());
  });
  fUnit.addEventListener("change", () => {
    state.fUnit = fUnit.value as FUnit;
    writeNumber(fNumber, state.freq, fScale());
  });

  document.querySelectorAll<HTMLInputElement>('input[name="sq-mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      state.mode = input.value as SquareMode;
      state.cursor = 0;
      state.startPeriods = 0;
      if (state.playing) setPlaying(false);
      else paintFull();
    });
  });

  document.querySelectorAll<HTMLInputElement>('input[name="sq-stage"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      focusStage(input.value as CycleStage);
    });
  });

  timeSlider.addEventListener("input", () => {
    state.periods = periodsFromSlider(Number(timeSlider.value));
    clampCursor();
    paintFull();
  });
  voltSlider.addEventListener("input", () => {
    state.voltZoom = zoomFromSlider(Number(voltSlider.value));
    paintFull();
  });
  startSlider.addEventListener("input", () => {
    state.startPeriods = clamp(Number(startSlider.value), 0, 40);
    clampCursor();
    paintFull();
  });

  $<HTMLInputElement>("sq-show-vc").addEventListener("change", (event) => {
    state.showVc = (event.target as HTMLInputElement).checked;
    paintFastKeepingLesson();
  });
  $<HTMLInputElement>("sq-show-i").addEventListener("change", (event) => {
    state.showI = (event.target as HTMLInputElement).checked;
    paintFastKeepingLesson();
  });

  playBtn.addEventListener("click", () => setPlaying(!state.playing));
  $<HTMLButtonElement>("sq-reset").addEventListener("click", () => {
    state.cursor = 0;
    state.startPeriods = 0;
    setPlaying(false);
  });

  $<HTMLButtonElement>("sq-worked").addEventListener("click", () => {
    state.R = WORKED_EXAMPLE.resistance;
    state.C = WORKED_EXAMPLE.capacitance;
    state.freq = WORKED_EXAMPLE.frequency;
    state.amplitude = WORKED_EXAMPLE.amplitude;
    state.offset = WORKED_EXAMPLE.offset;
    state.mode = "periodic";
    state.stage = "rise";
    state.rUnit = "kohm";
    state.cUnit = "nF";
    state.fUnit = "Hz";
    state.periods = 3;
    state.voltZoom = 1;
    state.cursor = 0;
    state.startPeriods = 0;
    if (state.playing) setPlaying(false);
    else paintFull();
  });

  for (const id of ["sq-pre-low", "sq-pre-mid", "sq-pre-high"]) {
    $(id).addEventListener("click", () => {
      const factor = Number($<HTMLButtonElement>(id).dataset.factor);
      state.freq = clamp(factor * cutoffFrequency(state.R, state.C), F_MIN, F_MAX);
      clampCursor();
      paintFull();
    });
  }

  scopeHost.addEventListener("pointerdown", (event) => {
    const t = timeFromPointer(event);
    if (t === null) return;
    state.cursor = t;
    try { scopeHost.setPointerCapture(event.pointerId); } catch { /* pointer capture needs a real pointer */ }
    if (state.playing) setPlaying(false);
    else paintFastKeepingLesson();
  });
  scopeHost.addEventListener("pointermove", (event) => {
    if (!scopeHost.hasPointerCapture(event.pointerId)) return;
    const t = timeFromPointer(event);
    if (t === null) return;
    state.cursor = t;
    paintFastKeepingLesson();
  });

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    if ($("view-square").hidden) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    event.preventDefault();
    setPlaying(!state.playing);
  });

  syncControls();
  paintFull();
}

function paintFastKeepingLesson() {
  clampCursor();
  paintScope();
}

export function refreshSquarePage() {
  if (state.playing) paintScope();
  else paintFull();
}
