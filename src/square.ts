/**
 * High-pass RC response to a 50% square wave.
 *
 * Vin switches between VH = D + A and VL = D − A.
 * The capacitor voltage cannot jump, so Vout jumps by the same amount as Vin.
 * Between edges the input is constant and
 *   Vout(t) = Vout(tk+) × exp[−(t − tk) / τ].
 *
 * Periodic steady state, with each period starting at a rising edge:
 *   h = T/2,  k = exp(−h/τ),  B = 2A / (1 + k)
 *   0 ≤ s < h:     Vout =  B × exp(−s/τ)
 *   h ≤ s < T:     Vout = −B × exp[−(s − h)/τ]
 *
 * Startup holds VC(0−) = 0 with the input already at VH, so Vout(0+) = VH.
 * Later edges still jump by ±2A. The memory of the empty capacitor fades as exp(−t/τ).
 */

import {
  formatAmps,
  formatFactor,
  formatFarads,
  formatGain,
  formatHz,
  formatLessonVolts,
  formatOhms,
  formatSeconds,
} from "./format.ts";
import { cutoffFrequency, frequencyResponse, timeConstant } from "./sim.ts";

export type SquareMode = "periodic" | "startup";
export type CycleStage = "rise" | "high" | "fall" | "low";

export interface SquareParams {
  resistance: number;
  capacitance: number;
  frequency: number;
  amplitude: number;
  offset: number;
}

export const WORKED_EXAMPLE: SquareParams = {
  resistance: 10_000,
  capacitance: 100e-9,
  frequency: 100,
  amplitude: 5,
  offset: 0,
};

export interface SquareFacts {
  tau: number;
  fc: number;
  period: number;
  half: number;
  high: number;
  low: number;
  amplitude: number;
  offset: number;
  jump: number;
  k: number;
  B: number;
  /** (T/2) / τ */
  halfOverTau: number;
  resistance: number;
}

export interface SquarePoint {
  t: number;
  vin: number;
  vout: number;
  vc: number;
  current: number;
}

export interface SquareLimits {
  t: number;
  tEdge: number | null;
  edge: "rise" | "fall" | null;
  jumped: boolean;
  before: SquarePoint;
  after: SquarePoint;
}

export function squareFacts(params: SquareParams): SquareFacts {
  const tau = timeConstant(params.resistance, params.capacitance);
  const fc = cutoffFrequency(params.resistance, params.capacitance);
  const period = 1 / params.frequency;
  const half = period / 2;
  const high = params.offset + params.amplitude;
  const low = params.offset - params.amplitude;
  const jump = 2 * params.amplitude;
  const halfOverTau = half / tau;
  const k = Math.exp(-halfOverTau);
  const B = jump / (1 + k);
  return {
    tau,
    fc,
    period,
    half,
    high,
    low,
    amplitude: params.amplitude,
    offset: params.offset,
    jump,
    k,
    B,
    halfOverTau,
    resistance: params.resistance,
  };
}

export function periodicCorners(facts: SquareFacts) {
  const bk = facts.B * facts.k;
  return {
    afterRise: facts.B,
    beforeFall: bk,
    afterFall: -facts.B,
    beforeRise: -bk,
  };
}

/** First cycle when the capacitor starts empty. */
export function startupCorners(facts: SquareFacts) {
  const beforeFirstFall = facts.high * facts.k;
  const afterFirstFall = beforeFirstFall - facts.jump;
  return {
    atStart: facts.high,
    beforeFirstFall,
    afterFirstFall,
    beforeNextRise: afterFirstFall * facts.k,
  };
}

function even(n: number): boolean {
  return ((n % 2) + 2) % 2 === 0;
}

function locate(half: number, t: number): { n: number; s: number } {
  let n = Math.floor(t / half);
  let s = t - n * half;
  if (s < 0) {
    n -= 1;
    s += half;
  }
  if (s >= half) {
    n += 1;
    s -= half;
  }
  if (s < 0) s = 0;
  return { n, s };
}

function makePoint(t: number, vin: number, vout: number, resistance: number): SquarePoint {
  return { t, vin, vout, vc: vin - vout, current: vout / resistance };
}

function voutOnInterval(facts: SquareFacts, mode: SquareMode, n: number, s: number): number {
  if (mode === "startup") {
    if (n < 0) return facts.high;
    const sign = even(n) ? 1 : -1;
    const memory = Math.exp((-n * facts.half) / facts.tau);
    const justAfter = sign * facts.B + (facts.high - facts.B) * memory;
    return justAfter * Math.exp(-s / facts.tau);
  }
  const sign = even(n) ? 1 : -1;
  return sign * facts.B * Math.exp(-s / facts.tau);
}

function pointOnInterval(
  params: SquareParams,
  facts: SquareFacts,
  mode: SquareMode,
  n: number,
  s: number,
  t: number,
): SquarePoint {
  if (mode === "startup" && n < 0) return makePoint(t, facts.high, facts.high, params.resistance);
  const vin = even(n) ? facts.high : facts.low;
  const vout = voutOnInterval(facts, mode, n, s);
  return makePoint(t, vin, vout, params.resistance);
}

/** Right-continuous value. An exact edge returns the value just after the jump. */
export function squarePoint(params: SquareParams, mode: SquareMode, t: number): SquarePoint {
  const facts = squareFacts(params);
  if (mode === "startup" && t <= 0) return makePoint(t, facts.high, facts.high, params.resistance);
  const { n, s } = locate(facts.half, t);
  return pointOnInterval(params, facts, mode, n, s, t);
}

export function squareLimits(
  params: SquareParams,
  mode: SquareMode,
  t: number,
  tolerance: number,
): SquareLimits {
  const facts = squareFacts(params);
  const n = Math.round(t / facts.half);
  const tEdge = n * facts.half;
  const near = Math.abs(t - tEdge) <= tolerance;
  if (!near || (mode === "startup" && n <= 0)) {
    const point = squarePoint(params, mode, mode === "startup" ? Math.max(0, t) : t);
    return { t: point.t, tEdge: null, edge: null, jumped: false, before: point, after: point };
  }
  const before = pointOnInterval(params, facts, mode, n - 1, facts.half, tEdge);
  const after = pointOnInterval(params, facts, mode, n, 0, tEdge);
  return {
    t: tEdge,
    tEdge,
    edge: even(n) ? "rise" : "fall",
    jumped: true,
    before,
    after,
  };
}

interface Stamp {
  t: number;
  order: number;
  point: SquarePoint;
}

export function squareSamples(
  params: SquareParams,
  mode: SquareMode,
  tStart: number,
  tEnd: number,
): SquarePoint[] {
  const facts = squareFacts(params);
  const stamps: Stamp[] = [];
  const span = Math.max(tEnd - tStart, facts.period * 1e-9);
  const uniform = 720;
  const edgeEps = Math.min(facts.half * 1e-4, span * 1e-4);

  const push = (n: number, s: number, t: number, order: number) => {
    if (t < tStart - 1e-12 || t > tEnd + 1e-12) return;
    stamps.push({
      t,
      order,
      point: pointOnInterval(params, facts, mode, n, s, t),
    });
  };

  for (let i = 0; i < uniform; i++) {
    const t = tStart + (span * i) / (uniform - 1);
    const nearEdge = Math.abs(t / facts.half - Math.round(t / facts.half)) * facts.half < edgeEps;
    if (nearEdge) continue;
    if (mode === "startup" && t <= 0) {
      stamps.push({ t, order: 1, point: makePoint(t, facts.high, facts.high, params.resistance) });
      continue;
    }
    const { n, s } = locate(facts.half, t);
    push(n, s, t, 1);
  }

  const n0 = Math.ceil(tStart / facts.half - 1e-9);
  const n1 = Math.floor(tEnd / facts.half + 1e-9);
  const marks = [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 4.5, 6];
  for (let n = n0; n <= n1; n++) {
    const tEdge = n * facts.half;
    if (mode === "startup" && n <= 0) {
      push(0, 0, Math.max(tEdge, 0), 2);
      continue;
    }
    push(n - 1, facts.half, tEdge, 0);
    push(n, 0, tEdge, 2);
    for (const mark of marks) {
      const s = mark * facts.tau;
      if (s > 0 && s < facts.half) push(n, s, tEdge + s, 1);
    }
  }

  stamps.sort((a, b) => a.t - b.t || a.order - b.order);
  const samples: SquarePoint[] = [];
  for (const stamp of stamps) {
    const prev = samples[samples.length - 1];
    if (prev && Math.abs(prev.t - stamp.point.t) < 1e-15 && prev.vout === stamp.point.vout && prev.vin === stamp.point.vin) {
      continue;
    }
    samples.push(stamp.point);
  }
  return samples;
}

export function isWorkedExample(params: SquareParams): boolean {
  const w = WORKED_EXAMPLE;
  return (
    Math.abs(params.resistance - w.resistance) < 0.5 &&
    Math.abs(params.capacitance - w.capacitance) / w.capacitance < 1e-9 &&
    Math.abs(params.frequency - w.frequency) < 1e-6 &&
    Math.abs(params.amplitude - w.amplitude) < 1e-9 &&
    Math.abs(params.offset - w.offset) < 1e-9
  );
}

function volts(value: number, signed = false): string {
  return formatLessonVolts(value, signed);
}

function term(value: number): string {
  return value < 0 ? `(${volts(value, true)})` : volts(value, true);
}

export function formatCircuitTime(seconds: number, period: number): string {
  if (!(Math.abs(seconds) > Math.abs(period) * 1e-9)) {
    if (period < 2e-3) return "0 µs";
    if (period < 2) return "0 ms";
    return "0 s";
  }
  return formatSeconds(seconds);
}

function formula(equation: string, substitution?: string): string {
  const sub = substitution ? `<p class="subst">${substitution}</p>` : "";
  return `<p class="eq">${equation}</p>${sub}`;
}

function regime(halfOverTau: number): "pulses" | "droop" | "square" {
  if (halfOverTau >= 5) return "pulses";
  if (halfOverTau <= 0.2) return "square";
  return "droop";
}

export function lessonHtml(params: SquareParams, mode: SquareMode): string {
  const facts = squareFacts(params);
  const corners = periodicCorners(facts);
  const sine = frequencyResponse("hp", params.frequency, facts.tau);
  const sinePeak = params.amplitude * sine.gain;
  const atCutoff = Math.abs(params.frequency - facts.fc) / facts.fc < 0.02;
  const halfTau = facts.halfOverTau;
  const shape = regime(halfTau);
  const ratioText = Math.abs(halfTau - Math.PI) < 1e-3 ? "π" : formatFactor(halfTau);
  const periodMemory = Math.exp(-facts.period / facts.tau);
  const jumpText = volts(facts.jump);
  const worked = isWorkedExample(params);

  const levelBlock = `
    ${formula("V<sub>H</sub> = D + A", `V<sub>H</sub> = ${volts(facts.offset)} + ${volts(facts.amplitude)} = ${volts(facts.high)}`)}
    ${formula("V<sub>L</sub> = D − A", `V<sub>L</sub> = ${volts(facts.offset)} − ${volts(facts.amplitude)} = ${volts(facts.low)}`)}
    ${formula("Input step = V<sub>H</sub> − V<sub>L</sub> = 2A", `2A = ${jumpText}. A rising edge changes the input by +${jumpText}. A falling edge changes it by −${jumpText}.`)}
    ${formula("T = 1/f &nbsp;&nbsp;and&nbsp;&nbsp; each plateau lasts T/2", `T = ${formatSeconds(facts.period)} and T/2 = ${formatSeconds(facts.half)}.`)}
  `;

  const lawBlock = `
    ${formula("V<sub>in</sub> = V<sub>C</sub> + V<sub>out</sub>", "The input splits across the capacitor and the resistor. Rearranged, V<sub>C</sub> = V<sub>in</sub> − V<sub>out</sub>.")}
    ${formula("I = C × dV<sub>C</sub>/dt", "Current is the capacitance times how fast the capacitor voltage is changing. dV<sub>C</sub>/dt means that rate of change.")}
    ${formula("V<sub>out</sub> = IR", `Ohm's law at the present resistance: I = V<sub>out</sub> / R = V<sub>out</sub> / ${formatOhms(facts.resistance)}.`)}
    <p>Put the three lines together. Because V<sub>in</sub> = V<sub>C</sub> + V<sub>out</sub>,</p>
    ${formula("dV<sub>in</sub>/dt = dV<sub>C</sub>/dt + dV<sub>out</sub>/dt")}
    <p>From the current law, dV<sub>C</sub>/dt = I/C = V<sub>out</sub>/(RC) = V<sub>out</sub>/τ. Substitute that in and multiply by τ:</p>
    ${formula(
      "RC × dV<sub>out</sub>/dt + V<sub>out</sub> = RC × dV<sub>in</sub>/dt",
      `RC = τ = ${formatSeconds(facts.tau)}. This is the rule the output obeys at every instant.`,
    )}
  `;

  const plateauBlock = `
    <p>While the square wave sits on a flat level, the input is not changing, so dV<sub>in</sub>/dt = 0. The rule collapses to</p>
    ${formula("dV<sub>out</sub>/dt = −V<sub>out</sub> / τ", `With τ = ${formatSeconds(facts.tau)}, a positive output falls and a negative output rises. Both head toward 0 V.`)}
    <p>t<sub>k</sub> is the time of the most recent edge, and V<sub>out</sub>(t<sub>k</sub><sup>+</sup>) is the output immediately after that edge. Until the next edge,</p>
    ${formula(
      "V<sub>out</sub>(t) = V<sub>out</sub>(t<sub>k</sub><sup>+</sup>) × exp[−(t − t<sub>k</sub>) / τ]",
      "exp(x) means e to the power x. The exponential starts at 1 right after the edge and shrinks toward 0.",
    )}
  `;

  const edgeBlock = `
    <p>The capacitor voltage cannot change in an instant. At an ideal edge, V<sub>C</sub> just after equals V<sub>C</sub> just before. Because V<sub>C</sub> = V<sub>in</sub> − V<sub>out</sub>, the whole input step appears at the output:</p>
    ${formula("V<sub>out</sub>(t<sub>k</sub><sup>+</sup>) − V<sub>out</sub>(t<sub>k</sub><sup>−</sup>) = V<sub>in</sub>(t<sub>k</sub><sup>+</sup>) − V<sub>in</sub>(t<sub>k</sub><sup>−</sup>)", `That difference is +${jumpText} on a rising edge and −${jumpText} on a falling edge.`)}
    <p>The output jumps by that amount, then decays toward zero until the next edge. The peak is allowed to be larger than A. Each edge moves the input by 2A, not by A, so the scale is not limited to ±A.</p>
  `;

  const midS = facts.half / 2;
  const midV = facts.B * Math.exp(-midS / facts.tau);
  const steadyBlock = `
    <p>After the startup transient has died away, every cycle is a copy of the one before it. A pulse does not have to begin at ±2A. Whatever voltage is still left from the previous half-cycle is part of the next peak.</p>
    ${formula("h = T/2", `h = ${formatSeconds(facts.half)}.`)}
    ${formula("k = exp(−h / τ)", `k = exp(−${formatSeconds(facts.half)} / ${formatSeconds(facts.tau)}) = exp(−${formatFactor(halfTau)}) = ${formatFactor(facts.k)}.`)}
    ${formula("B = 2A / (1 + k)", `B = ${jumpText} / (1 + ${formatFactor(facts.k)}) = ${volts(facts.B)}.`)}
    <p>Let each period start at a rising edge, and let s = t modulo T. That means s is the time since the latest rising edge, from 0 up to T.</p>
    ${formula("For 0 ≤ s &lt; h: &nbsp; V<sub>out</sub> = B × exp(−s / τ)", `V<sub>out</sub> = ${volts(facts.B)} × exp(−s / ${formatSeconds(facts.tau)}).`)}
    ${formula("For h ≤ s &lt; T: &nbsp; V<sub>out</sub> = −B × exp[−(s − h) / τ]", `V<sub>out</sub> = −${volts(facts.B)} × exp[−(s − ${formatSeconds(facts.half)}) / ${formatSeconds(facts.tau)}].`)}
    <dl class="stats four steady-stats">
      <div><dt>Just after rising</dt><dd>+B = ${volts(corners.afterRise, true)}</dd></div>
      <div><dt>Just before falling</dt><dd>+Bk = ${volts(corners.beforeFall, true)}</dd></div>
      <div><dt>Just after falling</dt><dd>−B = ${volts(corners.afterFall, true)}</dd></div>
      <div><dt>Just before the next rise</dt><dd>−Bk = ${volts(corners.beforeRise, true)}</dd></div>
    </dl>
    <p>The jump of 2A has to connect those leftovers. With the present numbers:</p>
    ${formula(
      "+Bk − 2A = −B",
      `+Bk − 2A = ${volts(corners.beforeFall, true)} − ${jumpText} = ${volts(corners.beforeFall - facts.jump, true)}, which equals −B = ${volts(corners.afterFall, true)}.`,
    )}
    ${formula(
      "−Bk + 2A = +B",
      `−Bk + 2A = ${volts(corners.beforeRise, true)} + ${jumpText} = ${volts(corners.beforeRise + facts.jump, true)}, which equals +B = ${volts(corners.afterRise, true)}.`,
    )}
    <p>Midway along the high plateau, s = ${formatSeconds(midS)} and V<sub>out</sub> = ${volts(midV)}. The orange curve passes through that point in every steady-state cycle.</p>
  `;

  const startup = startupCorners(facts);
  const startupBlock = `
    <p>${mode === "startup" ? "The graph is using the uncharged-capacitor start." : "The graph is using periodic steady state. The startup story below is what the other mode draws."}</p>
    <p>Startup begins at t = 0 with the input already at the high level and with V<sub>C</sub>(0<sup>−</sup>) = 0. Nothing is stored on the capacitor, so the whole input appears across the resistor:</p>
    ${formula("V<sub>out</sub>(0<sup>+</sup>) = V<sub>H</sub>", `V<sub>out</sub>(0<sup>+</sup>) = ${volts(facts.high)}. The periodic peak would instead be +B = ${volts(facts.B)}. The difference is ${volts(facts.high - facts.B)}.`)}
    ${formula(
      "V<sub>out</sub>(t) = V<sub>H</sub> × exp(−t / τ) &nbsp; until the first falling edge",
      `V<sub>out</sub>(t) = ${volts(facts.high)} × exp(−t / ${formatSeconds(facts.tau)}) for 0 ≤ t &lt; ${formatSeconds(facts.half)}.`,
    )}
    <p>At t = T/2 the input falls by ${jumpText}. The capacitor voltage stays continuous, so the output falls by ${jumpText} as well, from ${volts(startup.beforeFirstFall, true)} to ${volts(startup.afterFirstFall, true)}. Every later edge jumps by ±${jumpText} and is followed by the same exponential decay.</p>
    <p>The extra startup voltage is multiplied by exp(−T/τ) = ${formatFactor(periodMemory)} once per period. ${
      periodMemory < 0.01
        ? "That factor is tiny, so the second cycle already looks like the periodic steady state."
        : `After several periods the extra voltage fades. About ${Math.max(1, Math.round(Math.log(100) * facts.tau / facts.period))} periods bring it under 1% of its starting size.`
    }</p>
    <p>The DC offset is D = ${volts(facts.offset)}. It sets both input levels: V<sub>H</sub> = ${volts(facts.high)} and V<sub>L</sub> = ${volts(facts.low)}. During startup, V<sub>out</sub>(0<sup>+</sup>) = V<sub>H</sub>, so the offset changes the first peak and the capacitor voltage.</p>
    <p>In periodic steady state a constant offset does not change the output waveform. The formulas for k and B contain A, T, and τ, and they do not contain D. The two halves of V<sub>out</sub> are equal and opposite, so the output average is 0 V. The capacitor's average voltage equals the offset, V<sub>C</sub> average = D = ${volts(facts.offset)}. The offset sits on the capacitor. Turn on the capacitor-voltage trace and move D to see that shift while the orange curve keeps the same shape.</p>
  `;

  const gainSentence = atCutoff
    ? `This frequency is the cutoff. A sine wave at f<sub>c</sub> has high-pass gain 0.707, so a ${volts(params.amplitude)} sine wave would come out with peak ${volts(params.amplitude / Math.SQRT2)}. The familiar 0.707 gain describes that sinusoid. It does not describe the complete square-wave output.`
    : `A sine wave at this same frequency would have high-pass gain ${formatGain(sine.gain)}, and a ${volts(params.amplitude)} sine wave would come out with peak ${volts(sinePeak)}. At the cutoff, that sine-wave gain is 0.707. The familiar 0.707 gain describes a sinusoid at f<sub>c</sub>. It does not describe the complete square-wave output.`;

  let shapeText: string;
  if (shape === "pulses") {
    shapeText = `T/2 is ${ratioText} time constants, much longer than RC. The output decays almost to zero before the next edge, so the drawing shows separated pulses. The periodic peak is ${volts(facts.B, true)}, close to the full step of ±${jumpText}.`;
  } else if (shape === "square") {
    shapeText = `T/2 is ${ratioText} time constants, much shorter than RC. Little decay happens between edges: each plateau only multiplies the output by k = ${formatFactor(facts.k)}. The output approaches the input square wave with its DC value removed, so the levels sit near ${volts(facts.amplitude, true)} and ${volts(-facts.amplitude, true)} rather than V<sub>H</sub> and V<sub>L</sub>.`;
  } else if (halfTau >= 2) {
    shapeText = `T/2 is ${ratioText} time constants. Most of each exponential finishes, but a visible remainder is still there at the next edge (k = ${formatFactor(facts.k)}). This is the intermediate droop between separated pulses and a flat square.`;
  } else {
    shapeText = `T/2 is ${ratioText} time constants. The output jumps, then sags in a clear exponential, and the next edge arrives with k = ${formatFactor(facts.k)} of the starting voltage still left. Intermediate values of T/2 and RC produce this droop.`;
  }

  const peakSentence =
    facts.B > facts.amplitude * 1.02
      ? `The periodic peaks are ±${volts(facts.B)}, which is larger than the input amplitude A = ${volts(facts.amplitude)}. That happens because each square-wave transition changes the input by 2A = ${jumpText}.`
      : `The periodic peaks are ±${volts(facts.B)}. They stay near A = ${volts(facts.amplitude)} when very little decay happens, because the jump of +2A is added to a leftover near −A.`;

  const shapeBlock = `
    <p>${shapeText}</p>
    <p>${peakSentence} ${gainSentence} The orange curve is the exponential solution above. It is not the square wave multiplied by the sine-wave gain.</p>
  `;

  const banner = worked
    ? `<p class="callout calm">Worked example: R = 10 kΩ, C = 100 nF, f = 100 Hz, A = 5 V peak, D = 0 V. Then τ = 1 ms, f<sub>c</sub> ≈ 159.15 Hz, T/2 = 5 ms, k ≈ 0.006738, and B ≈ 9.933 V.</p>`
    : "";

  return `
    ${banner}
    <section class="explain">
      <h3>Time constant and cutoff</h3>
      ${formula("τ = RC", `τ = ${formatOhms(params.resistance)} × ${formatFarads(params.capacitance)} = ${formatSeconds(facts.tau)}.`)}
      ${formula("f<sub>c</sub> = 1 / (2πRC)", `f<sub>c</sub> = 1 / (2π × ${formatSeconds(facts.tau)}) ≈ ${formatHz(facts.fc)}.`)}
      <p>τ is the time in which an exponential falls to about 37% of its starting value. f<sub>c</sub> is the frequency where a sine wave has gain 0.707. The square wave you are looking at is a different shape, so 0.707 is not its output size.</p>
    </section>
    <section class="explain">
      <h3>The square-wave input</h3>
      <p>The input is a 50% square wave. It holds one level for half a period, then the other level for the next half.</p>
      ${levelBlock}
    </section>
    <section class="explain">
      <h3>How the parts share the voltage</h3>
      ${lawBlock}
    </section>
    <section class="explain">
      <h3>Between the switching edges</h3>
      ${plateauBlock}
    </section>
    <section class="explain">
      <h3>What an edge does</h3>
      ${edgeBlock}
    </section>
    <section class="explain">
      <h3>Periodic steady state</h3>
      ${steadyBlock}
    </section>
    <section class="explain">
      <h3>Startup and DC offset</h3>
      ${startupBlock}
    </section>
    <section class="explain">
      <h3>What shape should you expect?</h3>
      ${shapeBlock}
    </section>
  `;
}

function currentSentence(vout: number, resistance: number): string {
  const amps = formatAmps(vout / resistance);
  if (Math.abs(vout) < 1e-9) return `The resistor current is about 0 A because the output is about 0 V.`;
  if (vout > 0) {
    return `I = V<sub>out</sub>/R = ${amps}. Positive current flows down through the resistor, from the output node to ground.`;
  }
  return `I = V<sub>out</sub>/R = ${amps}. Negative current flows up through the resistor, from ground toward the output node.`;
}

function tauSentence(start: number, facts: SquareFacts, fits: boolean): string {
  if (fits) {
    const left = start * Math.exp(-1);
    return `One time constant still fits before the next edge. V<sub>out</sub>(t<sub>k</sub> + τ) = e<sup>−1</sup> × V<sub>out</sub>(t<sub>k</sub><sup>+</sup>) ≈ 0.368 × ${volts(start)} = ${volts(left)}. The τ mark on the graph is that instant. About 63% of the starting voltage has gone, and about 37% remains.`;
  }
  return `One time constant would end at τ = ${formatSeconds(facts.tau)}, but the next edge is sooner, at T/2 = ${formatSeconds(facts.half)}. The decay is interrupted. This plateau only multiplies the output by k = ${formatFactor(facts.k)}.`;
}

export function stageHtml(params: SquareParams, mode: SquareMode, stage: CycleStage, cycleStart: number): string {
  const facts = squareFacts(params);
  const tol = facts.half * 0.4;
  const start = mode === "startup" ? Math.max(0, cycleStart) : cycleStart;
  const rise = squareLimits(params, mode, start, tol);
  const fall = squareLimits(params, mode, start + facts.half, tol);
  const next = squareLimits(params, mode, start + facts.period, tol);
  const fits = facts.tau < facts.half * 0.995;
  const settled = Math.abs(rise.after.vout - facts.B) <= 0.01 * Math.max(facts.jump, 1e-9);
  const when = `This highlight is the cycle that contains the cursor, starting at t = ${formatCircuitTime(start, facts.period)}.`;

  if (stage === "rise") {
    if (!rise.jumped) {
      return `
        <p>${when}</p>
        ${formula("V<sub>out</sub>(0<sup>+</sup>) = V<sub>H</sub>", `V<sub>out</sub>(0<sup>+</sup>) = ${volts(facts.high)} because V<sub>C</sub>(0<sup>−</sup>) = 0 and the input is already ${volts(facts.high)}.`)}
        <p>At the start there is no previous half-cycle, so this is not a jump of +2A. The capacitor voltage is 0 V and stays continuous from that initial value. ${currentSentence(rise.after.vout, facts.resistance)} During the plateau that follows, the output decays exponentially from ${volts(facts.high)} toward 0 V.</p>
      `;
    }
    const dV = rise.after.vout - rise.before.vout;
    return `
      <p>${when}</p>
      ${formula(
        "V<sub>out</sub>(t<sub>k</sub><sup>+</sup>) − V<sub>out</sub>(t<sub>k</sub><sup>−</sup>) = +2A",
        `${term(rise.after.vout)} − ${term(rise.before.vout)} = ${volts(dV, true)}. The input also increases by ${volts(facts.jump)}, from ${volts(rise.before.vin)} to ${volts(rise.after.vin)}.`,
      )}
      <p>At the rising edge, the input increases by ${volts(facts.jump)}. The capacitor voltage stays continuous at ${volts(rise.after.vc)}, so the output also increases by ${volts(facts.jump)}. ${currentSentence(rise.after.vout, facts.resistance)} During the plateau, the output decays exponentially.</p>
      ${mode === "startup" && !settled ? `<p>Periodic steady state would land on +B = ${volts(facts.B, true)}. This cycle still remembers the startup charge, so the height is ${volts(rise.after.vout, true)}.</p>` : ""}
    `;
  }

  if (stage === "high") {
    const v0 = rise.after.vout;
    const v1 = fall.before.vout;
    return `
      <p>${when}</p>
      ${formula(
        "V<sub>out</sub> = V<sub>out</sub>(t<sub>k</sub><sup>+</sup>) × exp(−s / τ)",
        `V<sub>out</sub> = ${volts(v0)} × exp(−s / ${formatSeconds(facts.tau)}), with s measured from the rising edge. The input is constant at V<sub>H</sub> = ${volts(facts.high)}, so dV<sub>in</sub>/dt = 0.`,
      )}
      <p>${tauSentence(v0, facts, fits)} Just before the falling edge, V<sub>out</sub> = ${volts(v1, true)}. The capacitor voltage moves from ${volts(rise.after.vc)} to ${volts(fall.before.vc)} because V<sub>C</sub> = V<sub>in</sub> − V<sub>out</sub> and the output is decaying. ${currentSentence(v0, facts.resistance)}</p>
    `;
  }

  if (stage === "fall") {
    const dV = fall.after.vout - fall.before.vout;
    return `
      <p>${when}</p>
      ${formula(
        "V<sub>out</sub>(t<sub>k</sub><sup>+</sup>) − V<sub>out</sub>(t<sub>k</sub><sup>−</sup>) = −2A",
        `${term(fall.after.vout)} − ${term(fall.before.vout)} = ${volts(dV, true)}. The input decreases by ${volts(facts.jump)}, from ${volts(fall.before.vin)} to ${volts(fall.after.vin)}.`,
      )}
      <p>At the falling edge, the input decreases by ${volts(facts.jump)}. The capacitor voltage stays continuous at ${volts(fall.after.vc)}, so the output also decreases by ${volts(facts.jump)}. ${currentSentence(fall.after.vout, facts.resistance)} During the low plateau, the output decays exponentially toward 0 V.</p>
      ${mode === "startup" && !settled ? `<p>Periodic steady state would jump from +Bk = ${volts(facts.B * facts.k, true)} to −B = ${volts(-facts.B, true)}. The jump here is still exactly −2A. The heights differ because the capacitor has not forgotten the start.</p>` : ""}
    `;
  }

  const v0 = fall.after.vout;
  const v1 = next.before.vout;
  return `
    <p>${when}</p>
    ${formula(
      "V<sub>out</sub> = V<sub>out</sub>(t<sub>k</sub><sup>+</sup>) × exp[−(s − h) / τ]",
      `V<sub>out</sub> = ${volts(v0)} × exp[−(s − ${formatSeconds(facts.half)}) / ${formatSeconds(facts.tau)}]. The input is constant at V<sub>L</sub> = ${volts(facts.low)}.`,
    )}
    <p>${tauSentence(v0, facts, fits)} Just before the next rising edge, V<sub>out</sub> = ${volts(v1, true)}. The capacitor voltage moves from ${volts(fall.after.vc)} to ${volts(next.before.vc)}. ${currentSentence(v0, facts.resistance)}</p>
  `;
}
