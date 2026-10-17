import {
  cutoffFrequency,
  frequencyResponse,
  generateTrace,
  integrateHold,
  stepCapacitor,
  timeConstant,
} from "./sim.ts";

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
