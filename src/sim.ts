/**
 * Series RC low-pass and high-pass filters.
 *
 * One shared capacitor voltage u obeys
 *   τ du/dt = Vin − u,   τ = RC.
 * Low-pass output is the capacitor voltage u.
 * High-pass output is the resistor voltage Vin − u.
 *
 * Piecewise-constant inputs (square wave, DC step) use the exact
 * exponential step, which is unconditionally stable. Sine waves use
 * the exact steady-state solution of the same differential equation.
 */

export type Waveform = "sine" | "square" | "step";
export type FilterKind = "lp" | "hp";

export interface Phasor {
  /** |H(jω)| */
  gain: number;
  /** arg H(jω), radians. Low-pass is ≤ 0 (lag). High-pass is ≥ 0 (lead). */
  phase: number;
}

export interface Sample {
  /** Seconds. */
  t: number;
  vin: number;
  lp: number;
  hp: number;
}

export interface TraceParams {
  resistance: number;
  capacitance: number;
  frequency: number;
  amplitude: number;
  offset: number;
  wave: Waveform;
  /**
   * Absolute time at the left edge of a periodic display.
   * Ignored for the DC step, which always starts before the jump.
   */
  origin?: number;
}

export interface Trace {
  samples: Sample[];
  /** Absolute start of the displayed window. */
  tStart: number;
  tEnd: number;
  tau: number;
  fc: number;
}

export function timeConstant(resistance: number, capacitance: number): number {
  return resistance * capacitance;
}

export function cutoffFrequency(resistance: number, capacitance: number): number {
  return 1 / (2 * Math.PI * resistance * capacitance);
}

/** H(jω) for a sine wave of frequency freqHz. */
export function frequencyResponse(kind: FilterKind, freqHz: number, tau: number): Phasor {
  const x = 2 * Math.PI * Math.max(0, freqHz) * tau;
  const den = Math.hypot(1, x);
  if (kind === "lp") {
    return { gain: 1 / den, phase: -Math.atan(x) };
  }
  if (x === 0) return { gain: 0, phase: Math.PI / 2 };
  return { gain: x / den, phase: Math.atan2(1, x) };
}

/**
 * Exact advance of τ u' = vin − u across dt when vin is held constant.
 * Large steps settle to vin. Tiny steps use the Taylor series so they
 * do not lose the increment to floating-point cancellation.
 */
export function stepCapacitor(u: number, vin: number, dt: number, tau: number): number {
  if (!(dt > 0)) return u;
  if (!(tau > 0)) return vin;
  const x = dt / tau;
  if (x > 40) return vin;
  if (x < 1e-6) return u + (vin - u) * (x - (x * x) / 2);
  return vin + (u - vin) * Math.exp(-x);
}

export function displaySpan(wave: Waveform, frequency: number, tau: number): { start: number; end: number } {
  if (wave === "step") {
    return { start: -0.4 * tau, end: 5 * tau };
  }
  const periods = 4;
  return { start: 0, end: periods / frequency };
}

interface SquareSteady {
  high: number;
  low: number;
  /** Capacitor voltage at the instant the input rises. */
  uRise: number;
  /** Capacitor voltage at the instant the input falls. */
  uFall: number;
  half: number;
  period: number;
}

function squareSteady(amplitude: number, offset: number, frequency: number, tau: number): SquareSteady {
  const period = 1 / frequency;
  const half = period / 2;
  const high = offset + amplitude;
  const low = offset - amplitude;
  const decay = Math.exp(-half / tau);
  const uRise = (low + decay * high) / (1 + decay);
  const uFall = stepCapacitor(uRise, high, half, tau);
  return { high, low, uRise, uFall, half, period };
}

function capacitorSquare(t: number, steady: SquareSteady, tau: number): number {
  let tm = t - steady.period * Math.floor(t / steady.period);
  if (tm < 0) tm += steady.period;
  if (tm < steady.half) return stepCapacitor(steady.uRise, steady.high, tm, tau);
  return stepCapacitor(steady.uFall, steady.low, tm - steady.half, tau);
}

function squareLevel(t: number, period: number, side: "left" | "right"): number {
  let turns = t / period;
  if (side === "left") turns -= 1e-12;
  let frac = turns - Math.floor(turns);
  if (frac < 0) frac += 1;
  return frac < 0.5 ? 1 : -1;
}

function pushStamp(stamps: { t: number; side: "left" | "right" }[], t: number, side: "left" | "right", t0: number, t1: number) {
  if (t < t0 || t > t1) return;
  stamps.push({ t, side });
}

export function generateTrace(params: TraceParams): Trace {
  const tau = timeConstant(params.resistance, params.capacitance);
  const fc = cutoffFrequency(params.resistance, params.capacitance);
  const span = displaySpan(params.wave, params.frequency, tau);
  const origin = params.wave === "step" ? 0 : params.origin ?? 0;
  const tStart = origin + span.start;
  const tEnd = origin + span.end;
  const stamps: { t: number; side: "left" | "right" }[] = [];
  const uniform = params.wave === "sine" ? 960 : 800;

  for (let i = 0; i < uniform; i++) {
    stamps.push({ t: tStart + ((tEnd - tStart) * i) / (uniform - 1), side: "right" });
  }

  if (params.wave === "square") {
    const period = 1 / params.frequency;
    const k0 = Math.floor(tStart / period) - 1;
    const k1 = Math.ceil(tEnd / period) + 1;
    for (let k = k0; k <= k1; k++) {
      for (const edge of [k * period, k * period + period / 2]) {
        pushStamp(stamps, edge, "left", tStart, tEnd);
        pushStamp(stamps, edge, "right", tStart, tEnd);
        for (const mark of [0.05, 0.15, 0.4, 1, 2]) {
          pushStamp(stamps, edge + mark * tau, "right", tStart, tEnd);
        }
      }
    }
  }

  if (params.wave === "step") {
    pushStamp(stamps, 0, "left", tStart, tEnd);
    pushStamp(stamps, 0, "right", tStart, tEnd);
    for (const mark of [0.05, 0.25, 0.5, 1, 2, 3, 4, 5]) {
      pushStamp(stamps, mark * tau, "right", tStart, tEnd);
    }
  }

  stamps.sort((a, b) => a.t - b.t || (a.side === b.side ? 0 : a.side === "left" ? -1 : 1));

  const samples: Sample[] = [];
  const lp = frequencyResponse("lp", params.frequency, tau);
  const hp = frequencyResponse("hp", params.frequency, tau);
  const omega = 2 * Math.PI * params.frequency;
  const steady = params.wave === "square" ? squareSteady(params.amplitude, params.offset, params.frequency, tau) : null;

  for (const stamp of stamps) {
    let vin: number;
    let u: number;
    if (params.wave === "sine") {
      vin = params.offset + params.amplitude * Math.sin(omega * stamp.t);
      u = params.offset + params.amplitude * lp.gain * Math.sin(omega * stamp.t + lp.phase);
      const hpOut = params.amplitude * hp.gain * Math.sin(omega * stamp.t + hp.phase);
      samples.push({ t: stamp.t, vin, lp: u, hp: hpOut });
      continue;
    }
    if (params.wave === "square" && steady) {
      const level = squareLevel(stamp.t, steady.period, stamp.side);
      vin = params.offset + params.amplitude * level;
      u = capacitorSquare(stamp.t, steady, tau);
    } else {
      const before = stamp.t < 0 || (stamp.t === 0 && stamp.side === "left");
      if (before) {
        vin = params.offset;
        u = params.offset;
      } else {
        vin = params.offset + params.amplitude;
        u = stepCapacitor(params.offset, vin, stamp.t, tau);
      }
    }
    samples.push({ t: stamp.t, vin, lp: u, hp: vin - u });
  }

  return { samples, tStart, tEnd, tau, fc };
}

/** Integrate a held input with the exponential step. Used to cross-check closed forms. */
export function integrateHold(
  vinAt: (t: number) => number,
  u0: number,
  t0: number,
  dt: number,
  steps: number,
  tau: number,
): { t: number; u: number; vin: number }[] {
  const out: { t: number; u: number; vin: number }[] = [];
  let u = u0;
  let t = t0;
  for (let i = 0; i <= steps; i++) {
    const vin = vinAt(t);
    out.push({ t, u, vin });
    if (i === steps) break;
    const vinHold = vinAt(t);
    u = stepCapacitor(u, vinHold, dt, tau);
    t += dt;
  }
  return out;
}

export function sampleExtents(samples: Sample[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    min = Math.min(min, s.vin, s.lp, s.hp);
    max = Math.max(max, s.vin, s.lp, s.hp);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1, max: 1 };
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}
