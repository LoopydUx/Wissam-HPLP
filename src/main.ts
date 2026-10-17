import { bodeSvg, circuitSvg, niceY, scopeSvg } from "./draw.ts";
import { initExamplesPage, refreshExamplesPage } from "./pulsePage.ts";
import { initSquarePage, refreshSquarePage } from "./squarePage.ts";
import { formatFarads, formatGain, formatHz, formatOhms, formatPhase, formatSeconds, formatVolts, inputString } from "./format.ts";
import { lessonHtml, responses } from "./lesson.ts";
import {
  cutoffFrequency,
  displaySpan,
  generateTrace,
  sampleExtents,
  timeConstant,
  type Sample,
  type Waveform,
} from "./sim.ts";

const R_MIN = 10;
const R_MAX = 1_000_000;
const C_MIN = 1e-9;
const C_MAX = 10e-6;
const F_MIN = 0.1;
const F_MAX = 1_000_000;

type RUnit = "ohm" | "kohm";
type CUnit = "nF" | "uF";
type FUnit = "Hz" | "kHz";

const state = {
  R: 10_000,
  C: 100e-9,
  freq: 0,
  amplitude: 5,
  offset: 0,
  wave: "sine" as Waveform,
  playing: false,
  origin: 0,
  cursorFrac: 0,
  rUnit: "kohm" as RUnit,
  cUnit: "nF" as CUnit,
  fUnit: "Hz" as FUnit,
};

state.freq = cutoffFrequency(state.R, state.C);

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as unknown as T;
}

const rSlider = $<HTMLInputElement>("r-slider");
const rNumber = $<HTMLInputElement>("r-number");
const rUnit = $<HTMLSelectElement>("r-unit");
const cSlider = $<HTMLInputElement>("c-slider");
const cNumber = $<HTMLInputElement>("c-number");
const cUnit = $<HTMLSelectElement>("c-unit");
const fSlider = $<HTMLInputElement>("f-slider");
const fNumber = $<HTMLInputElement>("f-number");
const fUnit = $<HTMLSelectElement>("f-unit");
const aSlider = $<HTMLInputElement>("a-slider");
const aNumber = $<HTMLInputElement>("a-number");
const oSlider = $<HTMLInputElement>("o-slider");
const oNumber = $<HTMLInputElement>("o-number");
const playBtn = $<HTMLButtonElement>("play");
const resetBtn = $<HTMLButtonElement>("reset");

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

function rScale() { return state.rUnit === "kohm" ? 1000 : 1; }
function cScale() { return state.cUnit === "uF" ? 1e-6 : 1e-9; }
function fScale() { return state.fUnit === "kHz" ? 1000 : 1; }

function writeNumber(input: HTMLInputElement, value: number, scale: number) {
  if (document.activeElement === input) return;
  input.value = inputString(value, scale);
}

function syncControls() {
  rSlider.value = String(sliderFromLog(state.R, R_MIN, R_MAX));
  cSlider.value = String(sliderFromLog(state.C, C_MIN, C_MAX));
  fSlider.value = String(sliderFromLog(state.freq, F_MIN, F_MAX));
  aSlider.value = String(state.amplitude);
  oSlider.value = String(state.offset);
  writeNumber(rNumber, state.R, rScale());
  writeNumber(cNumber, state.C, cScale());
  writeNumber(fNumber, state.freq, fScale());
  writeNumber(aNumber, state.amplitude, 1);
  writeNumber(oNumber, state.offset, 1);
  rUnit.value = state.rUnit;
  cUnit.value = state.cUnit;
  fUnit.value = state.fUnit;
  const radio = document.querySelector<HTMLInputElement>(`input[name="wave"][value="${state.wave}"]`);
  if (radio) radio.checked = true;
}

function parseField(input: HTMLInputElement, scale: number, min: number, max: number): number | null {
  const raw = Number(input.value);
  if (!Number.isFinite(raw)) return null;
  return clamp(raw * scale, min, max);
}

function parkStepCursor() {
  const tau = timeConstant(state.R, state.C);
  const span = displaySpan("step", state.freq, tau);
  const duration = span.end - span.start;
  state.cursorFrac = (0 - span.start) / duration;
}

function viewModel() {
  const tau = timeConstant(state.R, state.C);
  const fc = cutoffFrequency(state.R, state.C);
  const span = displaySpan(state.wave, state.freq, tau);
  const origin = state.wave === "step" ? 0 : state.origin;
  const trace = generateTrace({
    resistance: state.R,
    capacitance: state.C,
    frequency: state.freq,
    amplitude: state.amplitude,
    offset: state.offset,
    wave: state.wave,
    origin,
  });
  const extent = sampleExtents(trace.samples);
  const y = niceY(extent.min, extent.max);
  const cursor = state.wave === "step" ? span.start + state.cursorFrac * (span.end - span.start) : null;
  return { tau, fc, trace, y, cursor, resp: responses(state.freq, tau) };
}

function paintScopes(view = viewModel()) {
  const { tau, trace, y, cursor } = view;
  const scopeBase = {
    samples: trace.samples,
    tStart: trace.tStart,
    tEnd: trace.tEnd,
    yMin: y.min,
    yMax: y.max,
    yStep: y.step,
    wave: state.wave,
    tau,
    cursor,
    relativeTime: state.wave !== "step",
  };
  const lpHost = $("scope-lp");
  const hpHost = $("scope-hp");
  lpHost.innerHTML = scopeSvg({ ...scopeBase, output: "lp" });
  hpHost.innerHTML = scopeSvg({ ...scopeBase, output: "hp" });
  lpHost.dataset.ymin = String(y.min);
  lpHost.dataset.ymax = String(y.max);
  hpHost.dataset.ymin = String(y.min);
  hpHost.dataset.ymax = String(y.max);
  lpHost.dataset.tstart = String(trace.tStart);
  hpHost.dataset.tstart = String(trace.tStart);
  lpHost.dataset.tend = String(trace.tEnd);
  hpHost.dataset.tend = String(trace.tEnd);
  paintCursor(trace.samples, cursor);
  return view;
}

function paint() {
  const view = viewModel();
  const { tau, fc, trace, resp } = view;
  const rLabel = formatOhms(state.R);
  const cLabel = formatFarads(state.C);

  $("m-tau").textContent = formatSeconds(tau);
  $("m-fc").textContent = formatHz(fc);
  $("m-ratio").textContent = (state.freq / fc).toFixed(2);
  $("m-tau").dataset.value = String(tau);
  $("m-fc").dataset.value = String(fc);
  $("m-ratio").dataset.value = String(state.freq / fc);

  $("circuit-lp").innerHTML = circuitSvg("lp", rLabel, cLabel, state.wave);
  $("circuit-hp").innerHTML = circuitSvg("hp", rLabel, cLabel, state.wave);
  paintScopes(view);

  $("stats-lp").innerHTML = statsHtml("lp", resp.lp, trace.samples);
  $("stats-hp").innerHTML = statsHtml("hp", resp.hp, trace.samples);

  $("bode").innerHTML = bodeSvg(tau, fc, state.freq);
  $("bode-note").textContent = bodeNote(resp.lp.gain, resp.hp.gain);
  $("lesson-body").innerHTML = lessonHtml({
    wave: state.wave,
    frequency: state.freq,
    fc,
    tau,
    amplitude: state.amplitude,
    offset: state.offset,
    lp: resp.lp,
    hp: resp.hp,
  });

  $("freq-control").classList.toggle("is-idle", state.wave === "step");
  $("freq-hint").textContent = state.wave === "step"
    ? "The DC step follows τ. Frequency is kept for when you switch back to sine or square."
    : "Logarithmic slider. Presets use the cutoff of the R and C above.";

  for (const id of ["pre-low", "pre-mid", "pre-high"]) {
    const btn = $<HTMLButtonElement>(id);
    const factor = Number(btn.dataset.factor);
    const active = Math.abs(state.freq - factor * fc) / fc < 0.01;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  playBtn.textContent = state.playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", state.playing ? "true" : "false");
}

function paintCursor(samples: { t: number; vin: number; lp: number; hp: number }[], cursor: number | null) {
  const el = $("cursor-read");
  if (cursor === null) {
    el.hidden = true;
    return;
  }
  let best = samples[0];
  let bestDist = Infinity;
  for (const s of samples) {
    const d = Math.abs(s.t - cursor);
    if (d <= bestDist) {
      best = s;
      bestDist = d;
    }
  }
  el.hidden = false;
  el.textContent = `Cursor  t = ${formatSeconds(cursor)}   Vin = ${formatVolts(best.vin)}   Low-pass = ${formatVolts(best.lp)}   High-pass = ${formatVolts(best.hp)}`;
}

function statsHtml(kind: "lp" | "hp", phasor: { gain: number; phase: number }, samples: Sample[]): string {
  if (state.wave === "sine") {
    const peak = state.amplitude * phasor.gain;
    const word = Math.abs(phasor.phase) < 0.02 ? "in phase" : kind === "lp" ? "lag" : "lead";
    return `
      <div><dt>Gain</dt><dd data-gain="${phasor.gain}">${formatGain(phasor.gain)}</dd></div>
      <div><dt>Output peak</dt><dd>${formatVolts(peak)}</dd></div>
      <div><dt>Phase</dt><dd data-phase="${phasor.phase}">${formatPhase(phasor.phase)} ${word}</dd></div>
    `;
  }
  if (state.wave === "step") {
    const tau = timeConstant(state.R, state.C);
    const at = (t: number) => {
      if (t <= 0) return { lp: state.offset, hp: 0 };
      const e = Math.exp(-t / tau);
      return {
        lp: state.offset + state.amplitude * (1 - e),
        hp: state.amplitude * e,
      };
    };
    const jump = at(0);
    const one = at(tau);
    const five = at(5 * tau);
    const pick = (row: { lp: number; hp: number }) => (kind === "lp" ? row.lp : row.hp);
    return `
      <div><dt>At the jump</dt><dd>${formatVolts(kind === "lp" ? jump.lp : state.amplitude)}</dd></div>
      <div><dt>After 1 τ</dt><dd>${formatVolts(pick(one))}</dd></div>
      <div><dt>After 5 τ</dt><dd>${formatVolts(pick(five))}</dd></div>
    `;
  }
  let hi = -Infinity;
  let lo = Infinity;
  for (const s of samples) {
    const v = kind === "lp" ? s.lp : s.hp;
    hi = Math.max(hi, v);
    lo = Math.min(lo, v);
  }
  const ratio = state.freq / cutoffFrequency(state.R, state.C);
  const note = kind === "lp"
    ? ratio > 2 ? "Small curve" : ratio < 0.5 ? "Follows the square" : "Rounded square"
    : ratio > 2 ? "Passes the jumps" : ratio < 0.5 ? "Spikes, then fades" : "Jumps, then sags";
  return `
    <div><dt>Highest</dt><dd>${formatVolts(hi)}</dd></div>
    <div><dt>Lowest</dt><dd>${formatVolts(lo)}</dd></div>
    <div><dt>Shape</dt><dd>${note}</dd></div>
  `;
}

function bodeNote(lpGain: number, hpGain: number): string {
  if (state.wave === "step") {
    return "This graph is the sine-wave gain. The DC step you are viewing depends on the time constant, not on the frequency marker.";
  }
  if (state.wave === "square") {
    return `A square wave is built from many sine waves. Its slowest piece, the fundamental, is at the blue marker: low-pass gain ${formatGain(lpGain)}, high-pass gain ${formatGain(hpGain)}.`;
  }
  return `At the selected frequency, low-pass gain is ${formatGain(lpGain)} and high-pass gain is ${formatGain(hpGain)}. Output peak = input peak × gain.`;
}

let raf = 0;
let last = 0;

function frame(now: number) {
  if (!state.playing) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (state.wave === "step") {
    state.cursorFrac = (state.cursorFrac + dt / 6) % 1;
  } else {
    const period = 1 / state.freq;
    state.origin = (state.origin + dt * period * 0.45) % period;
  }
  paintScopes();
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
    paint();
  }
}

rSlider.addEventListener("input", () => {
  state.R = logFromSlider(Number(rSlider.value), R_MIN, R_MAX);
  writeNumber(rNumber, state.R, rScale());
  paint();
});
cSlider.addEventListener("input", () => {
  state.C = logFromSlider(Number(cSlider.value), C_MIN, C_MAX);
  writeNumber(cNumber, state.C, cScale());
  paint();
});
fSlider.addEventListener("input", () => {
  state.freq = logFromSlider(Number(fSlider.value), F_MIN, F_MAX);
  writeNumber(fNumber, state.freq, fScale());
  paint();
});
aSlider.addEventListener("input", () => {
  state.amplitude = Number(aSlider.value);
  writeNumber(aNumber, state.amplitude, 1);
  paint();
});
oSlider.addEventListener("input", () => {
  state.offset = Number(oSlider.value);
  writeNumber(oNumber, state.offset, 1);
  paint();
});

rNumber.addEventListener("input", () => {
  const next = parseField(rNumber, rScale(), R_MIN, R_MAX);
  if (next === null) return;
  state.R = next;
  rSlider.value = String(sliderFromLog(state.R, R_MIN, R_MAX));
  paint();
});
cNumber.addEventListener("input", () => {
  const next = parseField(cNumber, cScale(), C_MIN, C_MAX);
  if (next === null) return;
  state.C = next;
  cSlider.value = String(sliderFromLog(state.C, C_MIN, C_MAX));
  paint();
});
fNumber.addEventListener("input", () => {
  const next = parseField(fNumber, fScale(), F_MIN, F_MAX);
  if (next === null) return;
  state.freq = next;
  fSlider.value = String(sliderFromLog(state.freq, F_MIN, F_MAX));
  paint();
});
function commitLinear(input: HTMLInputElement, min: number, max: number, assign: (value: number) => void, slider: HTMLInputElement) {
  const next = parseField(input, 1, min, max);
  if (next === null) return;
  assign(next);
  slider.value = String(next);
  paint();
}

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

document.querySelectorAll<HTMLInputElement>('input[name="wave"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    state.wave = input.value as Waveform;
    if (state.wave === "step") parkStepCursor();
    state.origin = 0;
    paint();
  });
});

playBtn.addEventListener("click", () => setPlaying(!state.playing));
resetBtn.addEventListener("click", () => {
  state.origin = 0;
  parkStepCursor();
  setPlaying(false);
});

for (const id of ["pre-low", "pre-mid", "pre-high"]) {
  $(id).addEventListener("click", () => {
    const factor = Number($<HTMLButtonElement>(id).dataset.factor);
    const fc = cutoffFrequency(state.R, state.C);
    state.freq = clamp(factor * fc, F_MIN, F_MAX);
    fSlider.value = String(sliderFromLog(state.freq, F_MIN, F_MAX));
    writeNumber(fNumber, state.freq, fScale());
    paint();
  });
}

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  if (document.getElementById("view-compare")?.hidden) return;
  const tag = (event.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  event.preventDefault();
  setPlaying(!state.playing);
});

type SimulatorPage = "compare" | "square" | "examples";

function pageFromHash(): SimulatorPage {
  if (location.hash === "#square") return "square";
  if (location.hash === "#examples") return "examples";
  return "compare";
}

function showPage(page: SimulatorPage) {
  const compare = document.getElementById("view-compare");
  const squareView = document.getElementById("view-square");
  const examplesView = document.getElementById("view-examples");
  if (!compare || !squareView || !examplesView) return;
  compare.hidden = page !== "compare";
  squareView.hidden = page !== "square";
  examplesView.hidden = page !== "examples";
  document.getElementById("nav-compare")?.setAttribute("aria-pressed", page === "compare" ? "true" : "false");
  document.getElementById("nav-square")?.setAttribute("aria-pressed", page === "square" ? "true" : "false");
  document.getElementById("nav-examples")?.setAttribute("aria-pressed", page === "examples" ? "true" : "false");
  document.title =
    page === "square" ? "High-pass RC: Square wave" : page === "examples" ? "RC worked examples" : "Low-pass and high-pass RC filters";
  if (page === "square") refreshSquarePage();
  if (page === "examples") refreshExamplesPage();
}

function openPage(page: SimulatorPage) {
  const hash = page === "compare" ? "#compare" : page === "square" ? "#square" : "#examples";
  if (location.hash !== hash) location.hash = hash;
  else showPage(page);
}

document.getElementById("nav-compare")?.addEventListener("click", () => openPage("compare"));
document.getElementById("nav-square")?.addEventListener("click", () => openPage("square"));
document.getElementById("nav-examples")?.addEventListener("click", () => openPage("examples"));
window.addEventListener("hashchange", () => showPage(pageFromHash()));

parkStepCursor();
syncControls();
paint();
initSquarePage();
initExamplesPage();
showPage(pageFromHash());
