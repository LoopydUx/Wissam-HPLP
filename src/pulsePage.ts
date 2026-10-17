import { inputString, signedTrim } from "./format.ts";
import { inputGraph, pulseCircuitSvg, responseGraph, type PlotLayout, type PlotMarker, type PlotNote } from "./pulseDraw.ts";
import { questionParts, renderSection } from "./pulseLesson.ts";
import {
  ORIGINAL_EXAMPLES,
  STEP_TITLES,
  answerVolts,
  cloneExample,
  formatCapacitance,
  formatMs,
  formatResistance,
  outputOf,
  plotWindow,
  pulseTrace,
  sameExample,
  sampleAt,
  solutionSteps,
  solvePulse,
  type CapacitanceUnit,
  type FilterKind,
  type PulseExample,
  type PulseSolution,
  type ResistanceUnit,
  type StepId,
} from "./pulseExamples.ts";

const LETTERS = "ABCDEFGH";
const STEP_FALLBACK: StepId[] = ["given", "tau", "piecewise", "before", "during", "after", "queries", "answers"];

const examples = ORIGINAL_EXAMPLES.map(cloneExample);
let index = 0;
let filter: FilterKind = "lp";
let shownThrough: StepId | null = null;
let showAll = false;
let editError = "";
let pendingScroll: string | null = null;
let solution: PulseSolution = solvePulse(examples[0]);

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

function shortVolts(value: number): string {
  return `${signedTrim(value, 3)} V`;
}

function rScale(example: PulseExample): number {
  return example.resistanceUnit === "kohm" ? 1000 : 1;
}

function cScale(example: PulseExample): number {
  return example.capacitanceUnit === "uF" ? 1e-6 : 1e-9;
}

function writeNumber(input: HTMLInputElement, value: number, scale: number) {
  if (document.activeElement === input) return;
  input.value = inputString(value, scale);
}

function visibleSteps(steps: StepId[]): StepId[] {
  if (showAll) return steps;
  if (!shownThrough) return [];
  if (!steps.includes(shownThrough)) {
    const pos = STEP_FALLBACK.indexOf(shownThrough);
    shownThrough = STEP_FALLBACK.slice(0, pos + 1).reverse().find((step) => steps.includes(step)) ?? null;
  }
  if (!shownThrough) return [];
  const at = steps.indexOf(shownThrough);
  return at < 0 ? [] : steps.slice(0, at + 1);
}

function markersFor(current: PulseSolution, includeMax: boolean): PlotMarker[] {
  const example = current.example;
  const marks: PlotMarker[] = [
    { t: example.ta, label: `ta ${formatMs(example.ta)}`, kind: "switch" },
    { t: example.tb, label: `tb ${formatMs(example.tb)}`, kind: "switch" },
  ];
  for (const t of example.requestedTimes) {
    if (marks.some((mark) => Math.abs(mark.t - t) <= 1e-9)) continue;
    marks.push({ t, label: formatMs(t), kind: "request" });
  }
  if (includeMax && example.askMaxCapacitor && !marks.some((mark) => Math.abs(mark.t - current.maxCapacitorTime) <= 1e-9)) {
    marks.push({ t: current.maxCapacitorTime, label: "max VC", kind: "max" });
  }
  return marks;
}

function notesFor(current: PulseSolution, kind: FilterKind, step: StepId | null): PlotNote[] {
  if (step !== "queries" && step !== "answers") return [];
  const notes: PlotNote[] = [];
  for (const query of current.queries) {
    if (kind === "hp" && query.atSwitch) {
      notes.push({
        t: query.t,
        voltage: query.after.hp,
        lines: [`Vo− ${answerVolts(query.before.hp)}`, `Vo+ ${answerVolts(query.after.hp)}`],
      });
    } else {
      const vo = outputOf(query.after, kind);
      notes.push({ t: query.t, voltage: vo, lines: [`Vo ${answerVolts(vo)}`] });
    }
  }
  if (step === "answers" && current.example.askMaxCapacitor) {
    const line = `VC max ${answerVolts(current.maxCapacitor)}`;
    const existing = notes.find((note) => Math.abs(note.t - current.maxCapacitorTime) <= 1e-9);
    if (existing) existing.lines.push(line);
    else notes.push({ t: current.maxCapacitorTime, voltage: current.maxCapacitor, lines: [line] });
  }
  return notes;
}

function highlightFor(step: StepId | null, current: PulseSolution, tEnd: number): { t0: number; t1: number } | null {
  const example = current.example;
  if (step === "before") return { t0: 0, t1: example.ta };
  if (step === "during") return { t0: example.ta, t1: example.tb };
  if (step === "after") return { t0: example.tb, t1: tEnd };
  return null;
}

function storeLayout(host: HTMLElement, layout: PlotLayout, live: boolean) {
  host.dataset.t0 = String(layout.tStart);
  host.dataset.t1 = String(layout.tEnd);
  host.dataset.padl = String(layout.padL);
  host.dataset.padt = String(layout.padT);
  host.dataset.plotw = String(layout.plotW);
  host.dataset.ploth = String(layout.plotH);
  host.dataset.vw = String(layout.width);
  host.dataset.vh = String(layout.height);
  host.dataset.ymin = String(layout.yMin);
  host.dataset.ymax = String(layout.yMax);
  host.dataset.live = live ? "1" : "0";
}

function paint() {
  const example = examples[index];
  solution = solvePulse(example);
  const steps = solutionSteps(solution);
  const visible = visibleSteps(steps);
  const current = visible[visible.length - 1] ?? null;
  const windowSpan = plotWindow(solution);
  const samples = pulseTrace(solution, windowSpan.tStart, windowSpan.tEnd);
  const showCurves = current === "before" || current === "during" || current === "after" || current === "queries" || current === "answers";
  const until =
    current === "before"
      ? { t: example.ta, order: 0 }
      : current === "during"
        ? { t: example.tb, order: 0 }
        : null;
  const highlight = highlightFor(current, solution, windowSpan.tEnd);
  const marks = markersFor(solution, current === "answers");
  const response = responseGraph({
    samples,
    tStart: windowSpan.tStart,
    tEnd: windowSpan.tEnd,
    filter,
    showInput: showCurves,
    showOutput: showCurves,
    until,
    highlight,
    markers: marks,
    notes: notesFor(solution, filter, current),
    emptyMessage: showCurves ? null : "Sketch the output here. Reveal a response step to draw the curve.",
    aria: showCurves
      ? `${filter === "lp" ? "Low-pass" : "High-pass"} response. Blue is the input and orange is the output.`
      : "Blank output graph for the sketch.",
  });
  const levels = [
    { t0: windowSpan.tStart, t1: example.ta, voltage: example.initialLevel },
    { t0: example.ta, t1: example.tb, voltage: example.pulseLevel },
    { t0: example.tb, t1: windowSpan.tEnd, voltage: example.initialLevel },
  ];
  const input = inputGraph({
    samples,
    tStart: windowSpan.tStart,
    tEnd: windowSpan.tEnd,
    levels,
    highlight,
    markers: marks.filter((mark) => mark.kind === "switch"),
    aria: `Input pulse from ${shortVolts(example.initialLevel)} to ${shortVolts(example.pulseLevel)} and back.`,
  });

  const question = questionParts(solution, filter);
  $("ex-position").textContent = `Example ${index + 1} of ${examples.length}`;
  $("ex-title").textContent = `Example ${example.id}. ${example.title}`;
  $("ex-stem").textContent = question.stem;
  $("ex-initial").innerHTML = question.initial;
  $("ex-questions").innerHTML = question.questions;
  $("ex-measure").textContent = question.measure;
  $("ex-circuit").innerHTML = pulseCircuitSvg(
    filter,
    formatResistance(example.resistance, example.resistanceUnit),
    formatCapacitance(example.capacitance, example.capacitanceUnit),
    `VC(0) = ${shortVolts(example.vc0)}`,
  );
  $("ex-circuit-card").classList.toggle("lp", filter === "lp");
  $("ex-circuit-card").classList.toggle("hp", filter === "hp");
  $("ex-output-card").classList.toggle("lp", filter === "lp");
  $("ex-output-card").classList.toggle("hp", filter === "hp");
  $("ex-filter-note").textContent =
    filter === "lp"
      ? "Low-pass: the output is the capacitor voltage. High-pass uses this same input and the same VC(0), with the output across the resistor."
      : "High-pass: the output is the resistor voltage. The input and VC(0) match the low-pass question. Capacitor voltage stays continuous, so the output can jump.";

  const inputHost = $("ex-input-graph");
  const outputHost = $("ex-output-graph");
  inputHost.innerHTML = input.svg;
  outputHost.innerHTML = response.svg;
  storeLayout(inputHost, input.layout, false);
  storeLayout(outputHost, response.layout, showCurves);
  $("ex-input-note").textContent =
    example.ta <= 0
      ? "The short lead before t = 0 is the constant level the input leaves at the first switch."
      : "Labeled levels are the input voltage. Dashed lines are the switching times ta and tb.";
  $("ex-output-note").textContent = showCurves
    ? "Blue is the input and orange is the output, on the same voltage scale. The shaded band is the step you are reading. Move across the graph for time, input, capacitor voltage, and output."
    : "The axes use the voltage range of this example. The orange curve appears when you reveal the response.";
  $("ex-solution").innerHTML = visible
    .map((step, stepIndex) => renderSection(solution, filter, step, LETTERS[stepIndex], step === current))
    .join("");

  const label = $("ex-step-label");
  if (!current) label.textContent = "Solution hidden. The output graph is blank so you can sketch it first.";
  else if (showAll) label.textContent = `Full solution. ${visible.length} steps, ending with the boxed answers.`;
  else label.textContent = `Step ${visible.length} of ${steps.length}. ${LETTERS[visible.length - 1]}. ${STEP_TITLES[current]}`;

  $<HTMLButtonElement>("ex-next-step").disabled = visible.length >= steps.length;
  $<HTMLButtonElement>("ex-full").disabled = showAll || visible.length >= steps.length;
  $<HTMLButtonElement>("ex-hide").disabled = visible.length === 0;
  $<HTMLButtonElement>("ex-prev").disabled = index === 0;
  $<HTMLButtonElement>("ex-next").disabled = index === examples.length - 1;
  $<HTMLButtonElement>("ex-restore").disabled = sameExample(example, ORIGINAL_EXAMPLES[index]);
  $("ex-edit-error").textContent = editError;
  $("ex-modified").hidden = sameExample(example, ORIGINAL_EXAMPLES[index]);
  for (const id of ["ex-input-tip", "ex-output-tip"]) $(id).hidden = true;
  for (const id of ["ex-input-read", "ex-output-read"]) {
    const readout = $(id);
    readout.hidden = true;
    readout.textContent = "";
  }

  document.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((button) => {
    button.setAttribute("aria-pressed", Number(button.dataset.example) === index ? "true" : "false");
  });
  const radio = document.querySelector<HTMLInputElement>(`input[name="ex-filter"][value="${filter}"]`);
  if (radio) radio.checked = true;

  $("ex-m-tau").textContent = formatMs(solution.tau);
  $("ex-m-ta").textContent = formatMs(example.ta);
  $("ex-m-tb").textContent = formatMs(example.tb);
  $("ex-m-vc").textContent = shortVolts(example.vc0);

  syncEditor();
  if (pendingScroll) {
    document.getElementById(pendingScroll)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    pendingScroll = null;
  }
}

function syncEditor() {
  const example = examples[index];
  writeNumber($<HTMLInputElement>("ex-r"), example.resistance, rScale(example));
  writeNumber($<HTMLInputElement>("ex-c"), example.capacitance, cScale(example));
  writeNumber($<HTMLInputElement>("ex-u0"), example.initialLevel, 1);
  writeNumber($<HTMLInputElement>("ex-up"), example.pulseLevel, 1);
  writeNumber($<HTMLInputElement>("ex-ta"), example.ta, 0.001);
  writeNumber($<HTMLInputElement>("ex-tb"), example.tb, 0.001);
  writeNumber($<HTMLInputElement>("ex-vc"), example.vc0, 1);
  const times = $<HTMLInputElement>("ex-times");
  if (document.activeElement !== times) {
    times.value = example.requestedTimes.map((t) => inputString(t, 0.001)).join(", ");
  }
  $<HTMLSelectElement>("ex-r-unit").value = example.resistanceUnit;
  $<HTMLSelectElement>("ex-c-unit").value = example.capacitanceUnit;
}

function readExample(): PulseExample | string {
  const current = examples[index];
  const rInput = $<HTMLInputElement>("ex-r");
  const cInput = $<HTMLInputElement>("ex-c");
  const resistanceUnit = $<HTMLSelectElement>("ex-r-unit").value as ResistanceUnit;
  const capacitanceUnit = $<HTMLSelectElement>("ex-c-unit").value as CapacitanceUnit;
  const resistance = Number(rInput.value) * (resistanceUnit === "kohm" ? 1000 : 1);
  const capacitance = Number(cInput.value) * (capacitanceUnit === "uF" ? 1e-6 : 1e-9);
  const initialLevel = Number($<HTMLInputElement>("ex-u0").value);
  const pulseLevel = Number($<HTMLInputElement>("ex-up").value);
  const ta = Number($<HTMLInputElement>("ex-ta").value) / 1000;
  const tb = Number($<HTMLInputElement>("ex-tb").value) / 1000;
  const vc0 = Number($<HTMLInputElement>("ex-vc").value);
  if (!(resistance > 0) || resistance > 1e12) return "Enter a positive resistance.";
  if (!(capacitance > 0) || capacitance > 1) return "Enter a positive capacitance.";
  if (!Number.isFinite(initialLevel) || !Number.isFinite(pulseLevel) || !Number.isFinite(vc0)) return "Enter finite voltages.";
  if (!Number.isFinite(ta) || ta < 0) return "The first switching time must be zero or later.";
  if (!Number.isFinite(tb) || !(tb > ta)) return "The second switching time must be later than the first.";
  const parts = $<HTMLInputElement>("ex-times").value.split(/[,;\s]+/).filter(Boolean);
  if (parts.length === 0) return "Enter at least one calculation time, in milliseconds.";
  const requestedTimes: number[] = [];
  for (const part of parts) {
    const time = Number(part);
    if (!Number.isFinite(time) || time < 0) return "Calculation times must be zero or later, in milliseconds.";
    const seconds = time / 1000;
    if (requestedTimes.every((kept) => Math.abs(kept - seconds) > 1e-9)) requestedTimes.push(seconds);
  }
  requestedTimes.sort((a, b) => a - b);
  return {
    ...current,
    resistance,
    capacitance,
    resistanceUnit,
    capacitanceUnit,
    initialLevel,
    pulseLevel,
    ta,
    tb,
    vc0,
    requestedTimes,
  };
}

function tryCommit(): boolean {
  const next = readExample();
  if (typeof next === "string") {
    editError = next;
    return false;
  }
  editError = "";
  examples[index] = next;
  return true;
}

function goTo(next: number) {
  index = Math.min(examples.length - 1, Math.max(0, next));
  showAll = false;
  shownThrough = null;
  editError = "";
  pendingScroll = "view-examples";
  paint();
}

function layoutOf(host: HTMLElement): PlotLayout | null {
  const width = Number(host.dataset.vw);
  const height = Number(host.dataset.vh);
  if (!(width > 0)) return null;
  return {
    width,
    height,
    padL: Number(host.dataset.padl),
    padT: Number(host.dataset.padt),
    plotW: Number(host.dataset.plotw),
    plotH: Number(host.dataset.ploth),
    tStart: Number(host.dataset.t0),
    tEnd: Number(host.dataset.t1),
    yMin: Number(host.dataset.ymin),
    yMax: Number(host.dataset.ymax),
  };
}

function bindPointer(hostId: string, tipId: string, readId: string, revealOutput: boolean) {
  const host = $(hostId);
  const tip = $(tipId);
  const read = $(readId);
  const hide = () => {
    host.querySelector(".hover-layer")?.setAttribute("visibility", "hidden");
    tip.hidden = true;
  };
  host.addEventListener("pointermove", (event) => {
    const layout = layoutOf(host);
    const svg = host.querySelector("svg");
    if (!layout || !svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * layout.width;
    const y = ((event.clientY - rect.top) / rect.height) * layout.height;
    if (x < layout.padL || x > layout.padL + layout.plotW || y < layout.padT || y > layout.padT + layout.plotH) {
      hide();
      return;
    }
    const t = layout.tStart + ((x - layout.padL) / layout.plotW) * (layout.tEnd - layout.tStart);
    const dt = ((10 / rect.width) * layout.width / layout.plotW) * (layout.tEnd - layout.tStart);
    const example = solution.example;
    const nearSwitch = Math.abs(t - example.ta) <= dt || Math.abs(t - example.tb) <= dt;
    const snapped = Math.abs(t - example.ta) <= dt ? example.ta : Math.abs(t - example.tb) <= dt ? example.tb : t;
    const sample = sampleAt(solution, snapped);
    const live = host.dataset.live === "1";
    const showState = live && revealOutput;
    const layer = host.querySelector(".hover-layer");
    layer?.setAttribute("visibility", "visible");
    const cursor = layer?.querySelector(".cursor");
    cursor?.setAttribute("x1", x.toFixed(2));
    cursor?.setAttribute("x2", x.toFixed(2));
    const yOf = (voltage: number) => layout.padT + ((layout.yMax - voltage) / (layout.yMax - layout.yMin || 1)) * layout.plotH;
    const inDot = layer?.querySelector(".cursor-dot.in");
    inDot?.setAttribute("cx", x.toFixed(2));
    inDot?.setAttribute("cy", yOf(sample.after.vin).toFixed(2));
    inDot?.setAttribute("visibility", live || !revealOutput ? "visible" : "hidden");
    const outDot = layer?.querySelector(".cursor-dot.out");
    if (outDot) {
      const vo = outputOf(sample.after, filter);
      outDot.setAttribute("cx", x.toFixed(2));
      outDot.setAttribute("cy", yOf(vo).toFixed(2));
      outDot.setAttribute("visibility", showState ? "visible" : "hidden");
    }

    const time = `t = ${formatMs(sample.t)}`;
    let text = time;
    if (nearSwitch && showState && filter === "hp") {
      text = `${time} (switching time)\nVin− = ${answerVolts(sample.before.vin)}    Vin+ = ${answerVolts(sample.after.vin)}\nVC = ${answerVolts(sample.before.vc)} (continuous)\nVo− = ${answerVolts(sample.before.hp)}    Vo+ = ${answerVolts(sample.after.hp)}`;
    } else if (nearSwitch && showState) {
      text = `${time} (switching time)\nVin− = ${answerVolts(sample.before.vin)}    Vin+ = ${answerVolts(sample.after.vin)}\nVC = ${answerVolts(sample.before.vc)}\nVo = ${answerVolts(sample.after.lp)} (continuous)`;
    } else if (showState) {
      text = `${time}\nVin = ${answerVolts(sample.after.vin)}\nVC = ${answerVolts(sample.after.vc)}\nVo = ${answerVolts(outputOf(sample.after, filter))}`;
    } else if (nearSwitch) {
      text = `${time}\nVin− = ${answerVolts(sample.before.vin)}\nVin+ = ${answerVolts(sample.after.vin)}`;
    } else {
      text = `${time}\nVin = ${answerVolts(sample.after.vin)}`;
    }
    read.hidden = false;
    read.textContent = text.replace(/\n/g, "   ");
    tip.hidden = false;
    tip.textContent = text;
    const frame = host.parentElement?.getBoundingClientRect();
    if (frame) {
      const left = event.clientX - frame.left + 16;
      const top = event.clientY - frame.top + 16;
      tip.style.left = `${Math.min(left, frame.width - 240)}px`;
      tip.style.top = `${Math.max(8, top)}px`;
    }
  });
  host.addEventListener("pointerleave", hide);
}

function bindEditor(id: string) {
  const input = $<HTMLInputElement>(id);
  const apply = () => {
    if (tryCommit()) paint();
    else $("ex-edit-error").textContent = editError;
  };
  input.addEventListener("input", apply);
  input.addEventListener("change", () => {
    if (!tryCommit()) editError = "";
    paint();
  });
}

export function refreshExamplesPage() {
  paint();
}

export function initExamplesPage() {
  $<HTMLButtonElement>("ex-prev").addEventListener("click", () => goTo(index - 1));
  $<HTMLButtonElement>("ex-next").addEventListener("click", () => goTo(index + 1));
  document.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((button) => {
    button.addEventListener("click", () => goTo(Number(button.dataset.example)));
  });
  document.querySelectorAll<HTMLInputElement>('input[name="ex-filter"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      filter = input.value as FilterKind;
      paint();
    });
  });
  $<HTMLButtonElement>("ex-next-step").addEventListener("click", () => {
    const steps = solutionSteps(solution);
    if (!shownThrough) shownThrough = steps[0];
    else {
      const at = steps.indexOf(shownThrough);
      if (at >= steps.length - 1) {
        showAll = true;
      } else shownThrough = steps[at + 1];
    }
    showAll = showAll || shownThrough === steps[steps.length - 1];
    pendingScroll = shownThrough ? `step-${shownThrough}` : null;
    paint();
  });
  $<HTMLButtonElement>("ex-full").addEventListener("click", () => {
    showAll = true;
    shownThrough = "answers";
    pendingScroll = "step-answers";
    paint();
  });
  $<HTMLButtonElement>("ex-hide").addEventListener("click", () => {
    showAll = false;
    shownThrough = null;
    pendingScroll = "ex-output-card";
    paint();
  });
  $<HTMLButtonElement>("ex-restore").addEventListener("click", () => {
    examples[index] = cloneExample(ORIGINAL_EXAMPLES[index]);
    editError = "";
    paint();
  });
  for (const id of ["ex-r", "ex-c", "ex-u0", "ex-up", "ex-ta", "ex-tb", "ex-vc", "ex-times"]) bindEditor(id);
  $<HTMLSelectElement>("ex-r-unit").addEventListener("change", () => {
    examples[index].resistanceUnit = $<HTMLSelectElement>("ex-r-unit").value as ResistanceUnit;
    paint();
  });
  $<HTMLSelectElement>("ex-c-unit").addEventListener("change", () => {
    examples[index].capacitanceUnit = $<HTMLSelectElement>("ex-c-unit").value as CapacitanceUnit;
    paint();
  });
  bindPointer("ex-input-graph", "ex-input-tip", "ex-input-read", false);
  bindPointer("ex-output-graph", "ex-output-tip", "ex-output-read", true);
  paint();
}
