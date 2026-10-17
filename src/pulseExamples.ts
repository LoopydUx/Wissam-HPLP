/**
 * Single rectangular pulse through a series RC circuit.
 *
 * The capacitor voltage is the state variable. On an interval that starts
 * at tk with constant input U,
 *   VC(t) = U + [VC(tk) − U] exp[−(t − tk)/τ],  τ = RC.
 * Low-pass output is VC. High-pass output is Vin − VC.
 * VC is continuous at every switching edge. The resistor voltage can jump.
 *
 * Times are seconds, resistance ohms, capacitance farads, voltages volts,
 * so every exponent (t − tk)/τ is dimensionless.
 */

import { signedTrim } from "./format.ts";
import { timeConstant, type FilterKind } from "./sim.ts";

export type { FilterKind };

export type ResistanceUnit = "ohm" | "kohm";
export type CapacitanceUnit = "nF" | "uF";
export type IntervalId = "before" | "during" | "after";
export type StepId = "given" | "tau" | "piecewise" | "before" | "during" | "after" | "queries" | "answers";

export interface PulseExample {
  id: number;
  title: string;
  resistance: number;
  capacitance: number;
  resistanceUnit: ResistanceUnit;
  capacitanceUnit: CapacitanceUnit;
  /** Level held before ta and again after tb. */
  initialLevel: number;
  /** Level held from ta until tb. */
  pulseLevel: number;
  /** First switching time, seconds. */
  ta: number;
  /** Second switching time, seconds. */
  tb: number;
  /** Capacitor voltage at t = 0, before any transition at that instant. */
  vc0: number;
  /** Times at which the output is requested, seconds. */
  requestedTimes: number[];
  /** Ask for the maximum capacitor voltage reached during the pulse. */
  askMaxCapacitor: boolean;
}

const ms = (value: number) => value / 1000;

export const ORIGINAL_EXAMPLES: readonly PulseExample[] = [
  {
    id: 1,
    title: "Negative-going pulse, capacitor initially uncharged",
    resistance: 10_000,
    capacitance: 1e-7,
    resistanceUnit: "kohm",
    capacitanceUnit: "uF",
    initialLevel: 4,
    pulseLevel: -6,
    ta: ms(1),
    tb: ms(3),
    vc0: 0,
    requestedTimes: [ms(3), ms(4)],
    askMaxCapacitor: false,
  },
  {
    id: 2,
    title: "Positive-going pulse from a settled negative level",
    resistance: 1_000,
    capacitance: 1e-6,
    resistanceUnit: "kohm",
    capacitanceUnit: "uF",
    initialLevel: -2,
    pulseLevel: 6,
    ta: ms(2),
    tb: ms(4),
    vc0: -2,
    requestedTimes: [ms(4), ms(8)],
    askMaxCapacitor: false,
  },
  {
    id: 3,
    title: "Short positive pulse from zero",
    resistance: 10_000,
    capacitance: 1e-7,
    resistanceUnit: "kohm",
    capacitanceUnit: "uF",
    initialLevel: 0,
    pulseLevel: 4,
    ta: ms(1),
    tb: ms(2),
    vc0: 0,
    requestedTimes: [ms(2), ms(3)],
    askMaxCapacitor: false,
  },
  {
    id: 4,
    title: "Pulse shorter than the time constant",
    resistance: 10_000,
    capacitance: 1e-6,
    resistanceUnit: "kohm",
    capacitanceUnit: "uF",
    initialLevel: 0,
    pulseLevel: 10,
    ta: ms(0),
    tb: ms(8),
    vc0: 0,
    requestedTimes: [ms(10)],
    askMaxCapacitor: true,
  },
];

export function cloneExample(example: PulseExample): PulseExample {
  return { ...example, requestedTimes: [...example.requestedTimes] };
}

export function sameExample(a: PulseExample, b: PulseExample): boolean {
  if (a.requestedTimes.length !== b.requestedTimes.length) return false;
  for (let i = 0; i < a.requestedTimes.length; i++) {
    if (Math.abs(a.requestedTimes[i] - b.requestedTimes[i]) > 1e-12) return false;
  }
  return (
    a.resistance === b.resistance &&
    a.capacitance === b.capacitance &&
    a.resistanceUnit === b.resistanceUnit &&
    a.capacitanceUnit === b.capacitanceUnit &&
    a.initialLevel === b.initialLevel &&
    a.pulseLevel === b.pulseLevel &&
    a.ta === b.ta &&
    a.tb === b.tb &&
    a.vc0 === b.vc0 &&
    a.askMaxCapacitor === b.askMaxCapacitor
  );
}

export interface NodeVoltages {
  vin: number;
  vc: number;
  lp: number;
  hp: number;
}

export interface SidedSample {
  t: number;
  atSwitch: boolean;
  edge: "ta" | "tb" | null;
  before: NodeVoltages;
  after: NodeVoltages;
}

export interface IntervalModel {
  id: IntervalId;
  t0: number;
  /** Exclusive end. Null when the interval continues for all later time. */
  t1: number | null;
  input: number;
  vcStart: number;
  target: number;
  vcEnd: number | null;
}

export interface PulseSolution {
  example: PulseExample;
  tau: number;
  valid: boolean;
  error: string | null;
  intervals: IntervalModel[];
  /** Capacitor voltage at ta, shared by both sides of that edge. */
  vcAtTa: number;
  vcAtTb: number;
  maxCapacitor: number;
  /** Time at which the pulse maximum is reached. Endpoints only, because VC is monotonic. */
  maxCapacitorTime: number;
  /** True when VC does not change during the pulse. */
  maxHeld: boolean;
  queries: SidedSample[];
}

export interface TracePoint extends NodeVoltages {
  t: number;
  /** 0 = value just before an edge, 1 = interior, 2 = value just after an edge. */
  order: number;
}

const STEP_ORDER: StepId[] = ["given", "tau", "piecewise", "before", "during", "after", "queries", "answers"];

export const STEP_TITLES: Record<StepId, string> = {
  given: "Given values and initial condition",
  tau: "Time constant",
  piecewise: "Input voltage as a piecewise function",
  before: "Response before the first transition",
  during: "Response between the two transitions",
  after: "Response after the second transition",
  queries: "Output at the requested times",
  answers: "Final answers",
};

/** Exact step of τ dVC/dt = U − VC. Tiny steps use the series so the change is not lost. */
export function capacitorVoltage(vcStart: number, target: number, elapsed: number, tau: number): number {
  if (!(elapsed > 0)) return vcStart;
  if (!(tau > 0) || !Number.isFinite(tau)) return target;
  const x = elapsed / tau;
  if (!Number.isFinite(x) || x > 700) return target;
  if (x < 1e-7) {
    const oneMinusExp = x - (x * x) / 2 + (x * x * x) / 6;
    return vcStart + (target - vcStart) * oneMinusExp;
  }
  return target + (vcStart - target) * Math.exp(-x);
}

export function outputOf(node: NodeVoltages, filter: FilterKind): number {
  return filter === "lp" ? node.lp : node.hp;
}

function node(vin: number, vc: number): NodeVoltages {
  return { vin, vc, lp: vc, hp: vin - vc };
}

function invalid(example: PulseExample, error: string): PulseSolution {
  return {
    example,
    tau: timeConstant(example.resistance, example.capacitance),
    valid: false,
    error,
    intervals: [],
    vcAtTa: example.vc0,
    vcAtTb: example.vc0,
    maxCapacitor: example.vc0,
    maxCapacitorTime: example.ta,
    maxHeld: true,
    queries: [],
  };
}

export function solvePulse(example: PulseExample): PulseSolution {
  const tau = timeConstant(example.resistance, example.capacitance);
  if (!(example.resistance > 0) || !(example.capacitance > 0) || !(tau > 0) || !Number.isFinite(tau)) {
    return invalid(example, "R and C must be positive, so the time constant is positive.");
  }
  if (!(example.ta >= 0) || !(example.tb > example.ta)) {
    return invalid(example, "The second switching time must be later than the first.");
  }
  for (const value of [example.initialLevel, example.pulseLevel, example.vc0, example.ta, example.tb]) {
    if (!Number.isFinite(value)) return invalid(example, "Every voltage and time must be a finite number.");
  }

  const intervals: IntervalModel[] = [];
  let vcAtTa = example.vc0;
  if (example.ta > 0) {
    const vcEnd = capacitorVoltage(example.vc0, example.initialLevel, example.ta, tau);
    intervals.push({
      id: "before",
      t0: 0,
      t1: example.ta,
      input: example.initialLevel,
      vcStart: example.vc0,
      target: example.initialLevel,
      vcEnd,
    });
    vcAtTa = vcEnd;
  }

  const vcAtTb = capacitorVoltage(vcAtTa, example.pulseLevel, example.tb - example.ta, tau);
  intervals.push({
    id: "during",
    t0: example.ta,
    t1: example.tb,
    input: example.pulseLevel,
    vcStart: vcAtTa,
    target: example.pulseLevel,
    vcEnd: vcAtTb,
  });
  intervals.push({
    id: "after",
    t0: example.tb,
    t1: null,
    input: example.initialLevel,
    vcStart: vcAtTb,
    target: example.initialLevel,
    vcEnd: null,
  });

  const maxHeld = Math.abs(vcAtTb - vcAtTa) <= 1e-12;
  const rising = vcAtTb >= vcAtTa;
  const solution: PulseSolution = {
    example,
    tau,
    valid: true,
    error: null,
    intervals,
    vcAtTa,
    vcAtTb,
    maxCapacitor: rising ? vcAtTb : vcAtTa,
    maxCapacitorTime: rising ? example.tb : example.ta,
    maxHeld,
    queries: [],
  };
  solution.queries = [...example.requestedTimes]
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
    .map((t) => sampleAt(solution, t));
  return solution;
}

function edgeTolerance(example: PulseExample): number {
  return Math.min(1e-9, Math.max(example.tb - example.ta, 1e-15) * 0.25);
}

function edgeAt(example: PulseExample, t: number): "ta" | "tb" | null {
  const tol = edgeTolerance(example);
  if (Math.abs(t - example.ta) <= tol) return "ta";
  if (Math.abs(t - example.tb) <= tol) return "tb";
  return null;
}

function snapTime(example: PulseExample, t: number): number {
  const edge = edgeAt(example, t);
  if (edge === "ta") return example.ta;
  if (edge === "tb") return example.tb;
  return t;
}

export function capacitorAt(solution: PulseSolution, t: number): number {
  const example = solution.example;
  const time = snapTime(example, t);
  if (time <= 0) return example.vc0;
  if (example.ta > 0 && time <= example.ta) {
    return capacitorVoltage(example.vc0, example.initialLevel, time, solution.tau);
  }
  if (time <= example.tb) {
    return capacitorVoltage(solution.vcAtTa, example.pulseLevel, time - example.ta, solution.tau);
  }
  return capacitorVoltage(solution.vcAtTb, example.initialLevel, time - example.tb, solution.tau);
}

function vinAt(example: PulseExample, t: number, side: "left" | "right"): number {
  const time = snapTime(example, t);
  const edge = edgeAt(example, time);
  if (edge === "ta") return side === "left" ? example.initialLevel : example.pulseLevel;
  if (edge === "tb") return side === "left" ? example.pulseLevel : example.initialLevel;
  if (time < example.ta) return example.initialLevel;
  if (time < example.tb) return example.pulseLevel;
  return example.initialLevel;
}

export function sampleAt(solution: PulseSolution, t: number): SidedSample {
  const example = solution.example;
  const time = snapTime(example, t);
  if (time < 0) {
    const held = node(example.initialLevel, example.vc0);
    return { t: time, atSwitch: false, edge: null, before: held, after: held };
  }
  const edge = edgeAt(example, time);
  const vc = capacitorAt(solution, time);
  const before = node(vinAt(example, time, "left"), vc);
  const after = node(vinAt(example, time, "right"), vc);
  return { t: time, atSwitch: edge !== null, edge, before, after };
}

export function solutionSteps(solution: PulseSolution): StepId[] {
  return STEP_ORDER.filter((step) => step !== "before" || solution.intervals.some((interval) => interval.id === "before"));
}

export function plotWindow(solution: PulseSolution): { tStart: number; tEnd: number } {
  const { ta, tb, requestedTimes } = solution.example;
  const last = Math.max(tb, 0, ...requestedTimes);
  const span = Math.max(last, solution.tau, tb - ta, 1e-6);
  const tail = Math.min(
    Math.max(solution.tau, (tb - ta) * 0.5, Math.max(last - ta, 0) * 0.25),
    Math.max(last, solution.tau) * 1.25,
  );
  const tEnd = last + (tail > 0 ? tail : span * 0.25);
  const lead = ta <= 1e-15 ? Math.min(Math.max(tEnd * 0.08, solution.tau * 0.12), tEnd * 0.18) : 0;
  return { tStart: -lead, tEnd };
}

export function pulseTrace(solution: PulseSolution, tStart: number, tEnd: number): TracePoint[] {
  const example = solution.example;
  const points: TracePoint[] = [];
  const edges = [example.ta, example.tb].filter((t) => t >= tStart - 1e-12 && t <= tEnd + 1e-12);
  const nearEdge = (t: number) => edges.some((edge) => Math.abs(t - edge) <= Math.max(1e-9, (tEnd - tStart) * 1e-6));

  const push = (t: number, order: number, side: "left" | "right") => {
    const sample = sampleAt(solution, t);
    const values = side === "left" ? sample.before : sample.after;
    points.push({ t: sample.t, ...values, order });
  };

  const count = 420;
  for (let i = 0; i < count; i++) {
    const t = tStart + ((tEnd - tStart) * i) / (count - 1);
    if (nearEdge(t)) continue;
    push(t, 1, "right");
  }

  for (const edge of edges) {
    push(edge, 0, "left");
    push(edge, 2, "right");
  }

  for (const query of solution.queries) {
    if (query.t < tStart || query.t > tEnd || query.atSwitch) continue;
    push(query.t, 1, "right");
  }

  points.sort((a, b) => a.t - b.t || a.order - b.order);
  const unique: TracePoint[] = [];
  for (const point of points) {
    const prev = unique[unique.length - 1];
    if (prev && Math.abs(prev.t - point.t) < 1e-15 && prev.order === point.order) continue;
    unique.push(point);
  }
  return unique;
}

const MINUS = "−";
const SUPER: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

function superscript(power: number): string {
  return String(power)
    .split("")
    .map((ch) => SUPER[ch] ?? ch)
    .join("");
}

export function signedFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "—";
  const text = value.toFixed(digits);
  return text.startsWith("-") ? MINUS + text.slice(1) : text;
}

/** Displayed answer, always three decimals. */
export function answerVolts(value: number): string {
  return `${signedFixed(value, 3)} V`;
}

export function scientific(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const sign = value < 0 ? MINUS : "";
  const abs = Math.abs(value);
  let exp = Math.floor(Math.log10(abs) + 1e-12);
  let mant = abs / 10 ** exp;
  if (mant >= 9.9999995) {
    mant /= 10;
    exp += 1;
  }
  const mantText = signedTrim(mant, 6);
  if (exp === 0) return sign + mantText;
  return `${sign}${mantText}×10${superscript(exp)}`;
}

export function formatMs(seconds: number): string {
  return `${formatMsNumber(seconds)} ms`;
}

export function formatMsNumber(seconds: number): string {
  const msValue = Math.round(seconds * 1e9) / 1e6;
  return signedTrim(msValue, 6);
}

export function formatDim(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  if (Math.abs(value - rounded) < 1e-8) return signedTrim(rounded, 6);
  return signedFixed(value, 6);
}

export function formatResistance(ohms: number, unit: ResistanceUnit): string {
  if (unit === "kohm") return `${signedTrim(ohms / 1000, 6)} kΩ`;
  return `${signedTrim(ohms, 6)} Ω`;
}

export function formatCapacitance(farads: number, unit: CapacitanceUnit): string {
  if (unit === "uF") return `${signedTrim(farads * 1e6, 6)} µF`;
  return `${signedTrim(farads * 1e9, 6)} nF`;
}

export function plainOhms(ohms: number): string {
  if (Math.abs(ohms) >= 1e7 || !Number.isInteger(ohms)) return `${scientific(ohms)} Ω`;
  return `${signedTrim(ohms, 6)} Ω`;
}
