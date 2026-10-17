import { formatFactor, formatHz, formatLessonVolts, formatSeconds } from "./format.ts";
import { renderSection } from "./pulseLesson.ts";
import {
  ORIGINAL_EXAMPLES,
  answerVolts,
  capacitorVoltage,
  plotWindow,
  pulseTrace,
  sampleAt,
  solvePulse,
  solutionSteps,
} from "./pulseExamples.ts";
import {
  cutoffFrequency,
  frequencyResponse,
  generateTrace,
  integrateHold,
  stepCapacitor,
  timeConstant,
} from "./sim.ts";
import {
  lessonHtml,
  periodicCorners,
  squareFacts,
  squareLimits,
  squarePoint,
  squareSamples,
  stageHtml,
  startupCorners,
  WORKED_EXAMPLE,
  type SquareParams,
} from "./square.ts";

const R = 10_000;
const C = 100e-9;
const tau = timeConstant(R, C);
const fc = cutoffFrequency(R, C);
const amp = 5;
const off = 0;

function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function near(actual: number, expected: number, tol: number, label: string) {
  const err = Math.abs(actual - expected);
  check(err <= tol, `${label}: got ${actual}, expected ${expected}, tol ${tol}`);
}

console.log("τ =", tau, "s, fc =", fc, "Hz");
near(tau, 1e-3, 1e-15, "tau");
near(fc, 1 / (2 * Math.PI * 1e-3), 1e-9, "fc");

const lpFc = frequencyResponse("lp", fc, tau);
const hpFc = frequencyResponse("hp", fc, tau);
near(lpFc.gain, 1 / Math.SQRT2, 1e-12, "lp gain at fc");
near(hpFc.gain, 1 / Math.SQRT2, 1e-12, "hp gain at fc");
near(lpFc.phase, -Math.PI / 4, 1e-12, "lp phase at fc");
near(hpFc.phase, Math.PI / 4, 1e-12, "hp phase at fc");
near(amp * lpFc.gain, 5 / Math.SQRT2, 1e-12, "lp output peak");
near(amp * hpFc.gain, 5 / Math.SQRT2, 1e-12, "hp output peak");

const lpLow = frequencyResponse("lp", 0.1 * fc, tau);
const hpLow = frequencyResponse("hp", 0.1 * fc, tau);
near(lpLow.gain, 1 / Math.sqrt(1.01), 1e-12, "lp gain 0.1 fc");
near(hpLow.gain, 0.1 / Math.sqrt(1.01), 1e-12, "hp gain 0.1 fc");
near(lpLow.phase, -Math.atan(0.1), 1e-12, "lp phase 0.1 fc");
near(hpLow.phase, Math.atan(10), 1e-12, "hp phase 0.1 fc");

const lpHigh = frequencyResponse("lp", 10 * fc, tau);
const hpHigh = frequencyResponse("hp", 10 * fc, tau);
near(lpHigh.gain, 1 / Math.sqrt(101), 1e-12, "lp gain 10 fc");
near(hpHigh.gain, 10 / Math.sqrt(101), 1e-12, "hp gain 10 fc");
near(lpHigh.phase, -Math.atan(10), 1e-12, "lp phase 10 fc");
near(hpHigh.phase, Math.atan(0.1), 1e-12, "hp phase 10 fc");

const sine = generateTrace({
  resistance: R,
  capacitance: C,
  frequency: fc,
  amplitude: amp,
  offset: 0,
  wave: "sine",
  origin: 0,
});
const at0 = sine.samples[0];
near(at0.t, 0, 1e-15, "sine t0");
near(at0.vin, 0, 1e-9, "sine vin(0)");
near(at0.lp, -2.5, 1e-9, "sine lp(0) lag");
near(at0.hp, 2.5, 1e-9, "sine hp(0) lead");
for (const s of sine.samples) {
  near(s.lp + s.hp, s.vin, 1e-6, "sine lp+hp");
}
const period = 1 / fc;
const first = sine.samples.filter((s) => s.t <= period);
const peak = (key: "vin" | "lp" | "hp") =>
  first.reduce((best, s) => (s[key] > best[key] ? s : best));
const tVin = peak("vin").t;
const tLp = peak("lp").t;
const tHp = peak("hp").t;
check(tLp > tVin + period * 0.05, `low-pass should lag, peaks at ${tLp} vs ${tVin}`);
check(tHp < tVin - period * 0.05, `high-pass should lead, peaks at ${tHp} vs ${tVin}`);

const step = generateTrace({
  resistance: R,
  capacitance: C,
  frequency: fc,
  amplitude: amp,
  offset: 2,
  wave: "step",
});
const pre = step.samples.find((s) => s.t === 0 && s.hp === 0);
const post = step.samples.find((s) => s.t === 0 && s.hp !== 0);
check(pre && post, "step has both sides of the jump");
near(pre.vin, 2, 1e-12, "step vin before");
near(pre.lp, 2, 1e-12, "step lp before");
near(pre.hp, 0, 1e-12, "step hp before");
near(post.vin, 7, 1e-12, "step vin after");
near(post.lp, 2, 1e-12, "step lp continuous");
near(post.hp, 5, 1e-12, "step hp jumps by amplitude");

const atTau = step.samples.reduce((best, s) => (Math.abs(s.t - tau) < Math.abs(best.t - tau) ? s : best));
near(atTau.t, tau, 1e-12, "sample at tau");
near(atTau.lp, 2 + 5 * (1 - Math.exp(-1)), 1e-9, "lp at one tau");
near(atTau.hp, 5 * Math.exp(-1), 1e-9, "hp at one tau");
const at5 = step.samples.reduce((best, s) => (Math.abs(s.t - 5 * tau) < Math.abs(best.t - 5 * tau) ? s : best));
near(at5.lp, 2 + 5 * (1 - Math.exp(-5)), 1e-9, "lp settled");
near(at5.hp, 5 * Math.exp(-5), 1e-9, "hp decayed");
for (const s of step.samples) near(s.lp + s.hp, s.vin, 1e-9, "step sum");

let u = 2;
const dt = tau / 2000;
for (let i = 0; i < 2000; i++) u = stepCapacitor(u, 7, dt, tau);
near(u, 2 + 5 * (1 - Math.exp(-1)), 1e-9, "integrator matches step at tau");

const alpha = Math.exp(-Math.PI);
const uRise = 5 * (-1 + alpha) / (1 + alpha);
const square = generateTrace({
  resistance: R,
  capacitance: C,
  frequency: fc,
  amplitude: amp,
  offset: off,
  wave: "square",
  origin: 0,
});
const rise = square.samples.find((s) => s.t === 0 && s.vin > 0);
check(rise, "square rising edge");
near(rise.lp, uRise, 1e-9, "square capacitor at rise");
near(rise.hp, 5 - uRise, 1e-9, "square hp spike");
near(rise.vin, 5, 1e-12, "square vin high");

const slow = generateTrace({
  resistance: R,
  capacitance: C,
  frequency: 0.1 * fc,
  amplitude: amp,
  offset: 0,
  wave: "square",
});
const periodSlow = 1 / (0.1 * fc);
const midHigh = slow.samples.reduce((best, s) =>
  Math.abs(s.t - periodSlow * 0.25) < Math.abs(best.t - periodSlow * 0.25) ? s : best,
);
near(midHigh.lp, 5, 0.05, "slow square lp reaches the high level");
check(Math.abs(midHigh.hp) < 0.2, `slow square hp should have faded, got ${midHigh.hp}`);
const slowSpike = slow.samples.find((s) => Math.abs(s.t) < 1e-12 && s.vin > 0);
check(slowSpike && slowSpike.hp > 9, `slow square spike, got ${slowSpike?.hp}`);

const fast = generateTrace({
  resistance: R,
  capacitance: C,
  frequency: 10 * fc,
  amplitude: amp,
  offset: 0,
  wave: "square",
});
let lpPeak = 0;
let hpMin = Infinity;
for (const s of fast.samples) {
  lpPeak = Math.max(lpPeak, Math.abs(s.lp));
  hpMin = Math.min(hpMin, Math.abs(s.hp));
}
check(lpPeak < 1.2 && lpPeak > 0.4, `fast square lp is a small wiggle, peak ${lpPeak}`);
check(hpMin > 3, `fast square hp stays large, min abs ${hpMin}`);

const sineSteps = integrateHold(
  (t) => amp * Math.sin(2 * Math.PI * fc * t),
  -2.5,
  0,
  (1 / fc) / 8000,
  8000,
  tau,
);
const end = sineSteps[sineSteps.length - 1];
const expectedU = amp * lpFc.gain * Math.sin(2 * Math.PI * fc * end.t + lpFc.phase);
near(end.u, expectedU, 0.02, "numerical sine stays on the analytic solution");

console.log("All filter checks passed.");

const worked = squareFacts(WORKED_EXAMPLE);
const corners = periodicCorners(worked);
near(worked.tau, 1e-3, 1e-12, "worked tau");
near(worked.fc, 1 / (2 * Math.PI * 1e-3), 1e-6, "worked fc");
near(worked.half, 5e-3, 1e-12, "worked half period");
near(worked.k, Math.exp(-5), 1e-12, "worked k");
near(worked.B, 10 / (1 + Math.exp(-5)), 1e-12, "worked B");
near(corners.afterRise, worked.B, 1e-15, "after rise");
near(corners.beforeFall, worked.B * worked.k, 1e-15, "before fall");
near(corners.afterFall, -worked.B, 1e-15, "after fall");
near(corners.beforeRise, -worked.B * worked.k, 1e-15, "before rise");
near(corners.beforeFall - worked.jump, corners.afterFall, 1e-12, "+Bk - 2A = -B");
near(corners.beforeRise + worked.jump, corners.afterRise, 1e-12, "-Bk + 2A = +B");
check(formatSeconds(worked.tau) === "1 ms", `tau text ${formatSeconds(worked.tau)}`);
check(formatHz(worked.fc) === "159.15 Hz", `fc text ${formatHz(worked.fc)}`);
check(formatSeconds(worked.half) === "5 ms", `half text ${formatSeconds(worked.half)}`);
check(formatFactor(worked.k) === "0.006738", `k text ${formatFactor(worked.k)}`);
check(formatLessonVolts(worked.B) === "9.933 V", `B text ${formatLessonVolts(worked.B)}`);
check(formatLessonVolts(corners.beforeFall) === "0.06693 V", `Bk text ${formatLessonVolts(corners.beforeFall)}`);
check(formatLessonVolts(corners.afterFall, true) === "−9.933 V", `−B text ${formatLessonVolts(corners.afterFall, true)}`);
check(formatLessonVolts(corners.beforeRise, true) === "−0.06693 V", `−Bk text ${formatLessonVolts(corners.beforeRise, true)}`);
check(worked.B > worked.amplitude, "periodic peak exceeds the input amplitude");

const sineAtWorked = frequencyResponse("hp", WORKED_EXAMPLE.frequency, worked.tau);
check(Math.abs(worked.B - WORKED_EXAMPLE.amplitude * sineAtWorked.gain) > 1, "square peak is not the sine-wave gain times A");

function assertPlateau(samples: { t: number; vin: number; vout: number; vc: number; current: number }[], jump: number, resistance: number, label: string) {
  check(samples.length > 10, `${label} has samples`);
  let jumps = 0;
  for (const sample of samples) {
    near(sample.vc, sample.vin - sample.vout, 1e-9, `${label} VC = Vin - Vout`);
    near(sample.current, sample.vout / resistance, 1e-12, `${label} I = Vout/R`);
  }
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const next = samples[i];
    if (Math.abs(prev.t - next.t) <= 1e-12) {
      jumps += 1;
      near(prev.vc, next.vc, 1e-8, `${label} capacitor stays continuous`);
      near(next.vout - prev.vout, next.vin - prev.vin, 1e-8, `${label} output jump matches input jump`);
      near(Math.abs(next.vin - prev.vin), jump, 1e-8, `${label} jump is 2A`);
    } else {
      near(prev.vin, next.vin, 1e-8, `${label} input holds between samples`);
    }
  }
  check(jumps >= 2, `${label} draws instant edges, found ${jumps}`);
}

const workedSamples = squareSamples(WORKED_EXAMPLE, "periodic", 0, 3 / WORKED_EXAMPLE.frequency);
assertPlateau(workedSamples, 10, WORKED_EXAMPLE.resistance, "worked periodic");
let workedPeak = -Infinity;
for (const sample of workedSamples) workedPeak = Math.max(workedPeak, sample.vout);
near(workedPeak, worked.B, 1e-8, "graph peak is +B, not clamped to A");

const startupSamples = squareSamples(WORKED_EXAMPLE, "startup", 0, 1 / WORKED_EXAMPLE.frequency);
assertPlateau(startupSamples, 10, WORKED_EXAMPLE.resistance, "worked startup");
near(startupSamples[0].t, 0, 1e-12, "startup begins at 0");
near(startupSamples[0].vout, WORKED_EXAMPLE.amplitude, 1e-9, "startup Vout(0+) = VH");
near(startupSamples[0].vc, 0, 1e-9, "startup VC(0) = 0");
const firstFall = squareLimits(WORKED_EXAMPLE, "startup", worked.half, 1e-8);
check(firstFall.jumped && firstFall.edge === "fall", "startup has a falling edge");
near(firstFall.before.vout, WORKED_EXAMPLE.offset + WORKED_EXAMPLE.amplitude * Math.exp(-5) * 0 + 5 * Math.exp(-5), 1e-9, "startup before first fall");
near(firstFall.after.vout - firstFall.before.vout, -10, 1e-9, "startup falling jump");
near(firstFall.after.vc, firstFall.before.vc, 1e-9, "startup VC continuous at first fall");

const startupAtZero = startupCorners(worked);
near(startupAtZero.atStart, 5, 1e-12, "startup corner VH");
near(startupAtZero.beforeFirstFall, 5 * Math.exp(-5), 1e-12, "startup VH k");
near(startupAtZero.afterFirstFall, 5 * Math.exp(-5) - 10, 1e-12, "startup after fall");

const shifted: SquareParams = { ...WORKED_EXAMPLE, offset: 3 };
for (let i = 0; i <= 24; i++) {
  const t = (i / 24) * worked.period;
  const plain = squarePoint(WORKED_EXAMPLE, "periodic", t);
  const moved = squarePoint(shifted, "periodic", t);
  near(moved.vout, plain.vout, 1e-9, "DC offset leaves periodic output unchanged");
  near(moved.vin - plain.vin, 3, 1e-9, "DC offset shifts the input");
  near(moved.vc - plain.vc, 3, 1e-9, "DC offset shifts the capacitor voltage");
}
const startupShift = squarePoint(shifted, "startup", 0);
near(startupShift.vout, 8, 1e-12, "startup output begins at the shifted VH");
near(startupShift.vc, 0, 1e-12, "shifted startup is still uncharged");
const startupLater = squarePoint(shifted, "startup", 4 * worked.period + 0.001);
const periodicLater = squarePoint(shifted, "periodic", 4 * worked.period + 0.001);
near(startupLater.vout, periodicLater.vout, 1e-6, "startup settles onto the periodic output");

const riseEdge = squareLimits(WORKED_EXAMPLE, "periodic", 0, 1e-9);
near(riseEdge.after.vout, worked.B, 1e-9, "periodic just after rising");
near(riseEdge.before.vout, -worked.B * worked.k, 1e-9, "periodic just before rising");
near(riseEdge.after.vc, riseEdge.before.vc, 1e-9, "periodic VC continuous at rising edge");

let cap = 0;
let clock = 0;
const steps = 400;
for (let edge = 0; edge < 4; edge++) {
  const vin = edge % 2 === 0 ? worked.high : worked.low;
  for (let i = 0; i < steps; i++) {
    const sample = squarePoint(WORKED_EXAMPLE, "startup", clock);
    near(sample.vc, cap, 1e-7, `integrator VC at t=${clock}`);
    near(sample.vin, vin, 1e-9, `integrator Vin at t=${clock}`);
    const tNext = edge * worked.half + (worked.half * (i + 1)) / steps;
    cap = stepCapacitor(cap, vin, tNext - clock, worked.tau);
    clock = tNext;
  }
}

const fastF = 10 * worked.fc;
const fastFacts = squareFacts({ ...WORKED_EXAMPLE, frequency: fastF });
const fastSine = frequencyResponse("hp", fastF, fastFacts.tau);
check(Math.abs(fastFacts.B - WORKED_EXAMPLE.amplitude * fastSine.gain) > 0.2, "fast square peak is not the sine gain");
check(fastFacts.halfOverTau < 1, "10 fc is only a fraction of a time constant");

const lesson = lessonHtml(WORKED_EXAMPLE, "periodic");
for (const phrase of ["9.933", "0.06693", "0.006738", "159.15", "0.707", "does not describe the complete square-wave output"]) {
  check(lesson.includes(phrase), `lesson missing ${phrase}`);
}
const stage = stageHtml(WORKED_EXAMPLE, "periodic", "rise", 0);
check(stage.includes("10 V"), "stage names the 10 V step");
check(stage.includes("continuous"), "stage explains capacitor continuity");
const high = stageHtml(WORKED_EXAMPLE, "periodic", "high", 0);
check(high.includes("0.368"), "high plateau explains one time constant");
const startupStage = stageHtml(WORKED_EXAMPLE, "startup", "rise", 0);
check(startupStage.includes("V<sub>H</sub>") || startupStage.includes("5"), "startup stage starts at VH");

console.log(
  "Worked example: τ =",
  formatSeconds(worked.tau),
  "fc =",
  formatHz(worked.fc),
  "k =",
  formatFactor(worked.k),
  "B =",
  formatLessonVolts(worked.B),
  "corners",
  formatLessonVolts(corners.afterRise, true),
  formatLessonVolts(corners.beforeFall, true),
  formatLessonVolts(corners.afterFall, true),
  formatLessonVolts(corners.beforeRise, true),
);
console.log("Square-wave checks passed.");

const expectedAnswers: Record<number, { tau: string; values: Record<string, string>; max?: string }> = {
  1: { tau: "1 ms", values: { "0.003": "−4.846 V", "0.004": "0.746 V" } },
  2: { tau: "1 ms", values: { "0.004": "4.917 V", "0.008": "−1.873 V" } },
  3: { tau: "1 ms", values: { "0.002": "2.528 V", "0.003": "0.930 V" } },
  4: { tau: "10 ms", values: { "0.01": "4.509 V" }, max: "5.507 V" },
};

for (const example of ORIGINAL_EXAMPLES) {
  const solved = solvePulse(example);
  check(solved.valid, `example ${example.id} solves`);
  const expect = expectedAnswers[example.id];
  check(formatMsMatch(solved.tau, expect.tau), `example ${example.id} tau text ${solved.tau}`);
  for (const query of solved.queries) {
    const key = String(Number(query.t.toFixed(6)));
    const wanted = expect.values[key];
    check(wanted !== undefined, `example ${example.id} unexpected query ${query.t}`);
    check(answerVolts(query.after.lp) === wanted, `example ${example.id} Vo(${query.t}) ${answerVolts(query.after.lp)} vs ${wanted}`);
    near(query.before.vc, query.after.vc, 1e-12, `example ${example.id} VC continuous at ${query.t}`);
    near(query.after.lp + query.after.hp, query.after.vin, 1e-12, `example ${example.id} lp+hp`);
    if (query.atSwitch) {
      near(query.after.hp - query.before.hp, query.after.vin - query.before.vin, 1e-12, `example ${example.id} hp jump`);
      near(query.before.lp, query.after.lp, 1e-12, `example ${example.id} lp continuous`);
    }
  }
  for (const edge of [example.ta, example.tb]) {
    const sample = sampleAt(solved, edge);
    check(sample.atSwitch, `example ${example.id} edge ${edge}`);
    near(sample.before.vc, sample.after.vc, 1e-15, `example ${example.id} VC continuous at edge`);
    near(sample.after.hp - sample.before.hp, sample.after.vin - sample.before.vin, 1e-12, `example ${example.id} resistor jump`);
    near(sample.before.lp, sample.after.lp, 1e-15, `example ${example.id} low-pass continuous`);
  }
  const window = plotWindow(solved);
  const trace = pulseTrace(solved, window.tStart, window.tEnd);
  let edges = 0;
  for (let i = 1; i < trace.length; i++) {
    const prev = trace[i - 1];
    const next = trace[i];
    near(prev.lp + prev.hp, prev.vin, 1e-9, `trace identity ${example.id}`);
    if (Math.abs(prev.t - next.t) <= 1e-12) {
      edges += 1;
      near(prev.vc, next.vc, 1e-12, `trace VC continuous ${example.id}`);
      near(next.hp - prev.hp, next.vin - prev.vin, 1e-12, `trace hp jump ${example.id}`);
    }
  }
  check(edges >= 2, `example ${example.id} draws both vertical edges, found ${edges}`);
  const answers = renderSection(solved, "lp", "answers", "H", true);
  for (const value of Object.values(expect.values)) check(answers.includes(value), `example ${example.id} answer box missing ${value}`);
  if (expect.max) check(answers.includes(expect.max), `example ${example.id} max missing ${expect.max}`);
  const steps = solutionSteps(solved);
  check(example.ta > 0 ? steps.includes("before") : !steps.includes("before"), `example ${example.id} before-step`);
}

const ex1 = solvePulse(ORIGINAL_EXAMPLES[0]);
near(ex1.tau, 0.001, 1e-15, "example 1 tau");
near(sampleAt(ex1, 0.001).after.lp, 4 * (1 - Math.exp(-1)), 1e-12, "example 1 Vo(1 ms)");
check(answerVolts(sampleAt(ex1, 0.001).after.lp) === "2.528 V", "example 1 displays 2.528 V");
const before = renderSection(ex1, "lp", "before", "D", false);
check(before.includes("2.528 V"), "example 1 solution shows Vo(1 ms)");
const given = renderSection(ex1, "lp", "given", "A", false);
check(given.includes("has not yet settled"), "example 1 explains the uncharged start");

const ex1hp = sampleAt(ex1, 0.003);
check(answerVolts(ex1hp.before.hp) === "−1.154 V", `hp before 3 ms ${answerVolts(ex1hp.before.hp)}`);
check(answerVolts(ex1hp.after.hp) === "8.846 V", `hp after 3 ms ${answerVolts(ex1hp.after.hp)}`);
const hpQuery = renderSection(ex1, "hp", "queries", "G", false);
check(hpQuery.includes("−1.154 V") && hpQuery.includes("8.846 V"), "high-pass solution labels both sides at 3 ms");
check(hpQuery.includes("before") && hpQuery.includes("after"), "high-pass solution names the sides");

const ex4 = solvePulse(ORIGINAL_EXAMPLES[3]);
near(ex4.tau, 0.01, 1e-15, "example 4 tau");
near(ex4.maxCapacitor, 10 * (1 - Math.exp(-0.8)), 1e-12, "example 4 max");
near(ex4.maxCapacitorTime, 0.008, 1e-15, "example 4 max time");
check(answerVolts(ex4.maxCapacitor) === "5.507 V", "example 4 max text");
const ex4answers = renderSection(ex4, "lp", "answers", "H", true);
check(ex4answers.includes("5τ"), "example 4 explains the short pulse");
check(ex4answers.includes("10") && ex4answers.includes("never reaches"), "example 4 explains why the target is missed");
const ex4edge = sampleAt(ex4, 0);
near(ex4edge.before.hp, 0, 1e-15, "example 4 hp before t=0");
near(ex4edge.after.hp, 10, 1e-15, "example 4 hp jumps to 10 V");
near(ex4edge.before.vc, ex4edge.after.vc, 1e-15, "example 4 VC continuous at t=0");

const custom = solvePulse({ ...ORIGINAL_EXAMPLES[0], resistance: 20_000 });
near(custom.tau, 0.002, 1e-15, "edited resistance changes tau");
near(
  sampleAt(custom, 0.001).after.vc,
  capacitorVoltage(0, 4, 0.001, 0.002),
  1e-12,
  "edited example uses the exponential state equation",
);

function formatMsMatch(seconds: number, text: string): boolean {
  const ms = Math.round(seconds * 1e9) / 1e6;
  return text === `${ms} ms`;
}

console.log("Pulse example checks passed.");
