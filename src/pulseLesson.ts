import { formatSeconds } from "./format.ts";
import type { FilterKind } from "./sim.ts";
import {
  answerVolts,
  formatCapacitance,
  formatDim,
  formatMs,
  formatMsNumber,
  formatResistance,
  plainOhms,
  scientific,
  signedFixed,
  type IntervalModel,
  type PulseSolution,
  type StepId,
} from "./pulseExamples.ts";

function formula(equation: string, substitution?: string): string {
  const sub = substitution ? `<p class="subst">${substitution}</p>` : "";
  return `<p class="eq">${equation}</p>${sub}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function voltsGiven(value: number): string {
  return `${signedTrimVolts(value)} V`;
}

function parenSigned(text: string): string {
  return text.startsWith("−") ? `(${text})` : text;
}

function signedTrimVolts(value: number): string {
  return signedFixed(value, 6)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "")
    .replace(/^−0$/, "0");
}

function kindName(filter: FilterKind): string {
  return filter === "lp" ? "low-pass" : "high-pass";
}

function joinTimes(times: number[]): string {
  const labels = times.map((t) => `t = ${formatMs(t)}`);
  if (labels.length === 0) return "the requested times";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function initialSentence(solution: PulseSolution): string {
  const example = solution.example;
  const vc = voltsGiven(example.vc0);
  if (example.ta <= 0) {
    return `The first input transition is at t = 0. The capacitor voltage at that instant is V<sub>C</sub>(0) = ${vc}. There is no earlier interval in which the capacitor can move.`;
  }
  if (Math.abs(example.vc0 - example.initialLevel) <= 1e-9) {
    return `The capacitor starts settled at the initial input level: V<sub>C</sub>(0) = ${vc}. Nothing changes until the first transition.`;
  }
  return `The capacitor starts at V<sub>C</sub>(0) = ${vc}, even though the input is already ${voltsGiven(example.initialLevel)} at t = 0. Calculate the response from t = 0 up to the first transition. The capacitor has not yet settled.`;
}

export function questionParts(solution: PulseSolution, filter: FilterKind): { stem: string; initial: string; questions: string; measure: string } {
  const example = solution.example;
  const r = formatResistance(example.resistance, example.resistanceUnit);
  const c = formatCapacitance(example.capacitance, example.capacitanceUnit);
  const where = filter === "lp" ? "across the capacitor" : "across the resistor";
  const stem =
    example.ta <= 0
      ? `This ${kindName(filter)} circuit has R = ${r} and C = ${c}. The input is one rectangular pulse with two switching events. At t = 0 it changes from ${voltsGiven(example.initialLevel)} to ${voltsGiven(example.pulseLevel)}. It holds that pulse until t = ${formatMs(example.tb)}, then returns to ${voltsGiven(example.initialLevel)} and stays there.`
      : `This ${kindName(filter)} circuit has R = ${r} and C = ${c}. The input is one rectangular pulse with two switching events. It holds ${voltsGiven(example.initialLevel)} until t = ${formatMs(example.ta)}, changes to ${voltsGiven(example.pulseLevel)}, and at t = ${formatMs(example.tb)} returns to ${voltsGiven(example.initialLevel)} and stays there.`;
  const questions = [
    `<li>Sketch the output voltage versus time. The output is the voltage ${where}.</li>`,
    `<li>Calculate the output voltage at ${joinTimes(example.requestedTimes)}.</li>`,
    example.askMaxCapacitor ? `<li>Calculate the maximum capacitor voltage reached during the pulse.</li>` : "",
  ].join("");
  const measure =
    filter === "lp"
      ? "Low-pass output measured across the capacitor. Ideal source, no load."
      : "High-pass output measured across the resistor. Ideal source, no load.";
  return { stem, initial: initialSentence(solution), questions, measure };
}

function unitLine(label: string, shown: string, converted: string): string {
  return formula(`${label}`, `${shown} = ${converted}.`);
}

function tauHtml(solution: PulseSolution): string {
  const example = solution.example;
  const rShown = formatResistance(example.resistance, example.resistanceUnit);
  const cShown = formatCapacitance(example.capacitance, example.capacitanceUnit);
  const rScale = example.resistanceUnit === "kohm" ? 1000 : 1;
  const rExp = example.resistanceUnit === "kohm" ? 3 : 0;
  const cScale = example.capacitanceUnit === "uF" ? 1e-6 : 1e-9;
  const cExp = example.capacitanceUnit === "uF" ? -6 : -9;
  const rMant = example.resistance / rScale;
  const cMant = example.capacitance / cScale;
  const rConv =
    rExp === 0
      ? `${signedTrimVolts(rMant)} Ω`
      : `${signedTrimVolts(rMant)} × 10${powerMarks(rExp)} Ω = ${plainOhms(example.resistance)}`;
  const cConv = `${signedTrimVolts(cMant)} × 10${powerMarks(cExp)} F = ${scientific(example.capacitance)} F`;
  return `
    ${formula("τ = RC", `R = ${rShown} and C = ${cShown}.`)}
    ${unitLine("Resistance in ohms", rShown, rConv)}
    ${unitLine("Capacitance in farads", cShown, cConv)}
    ${formula(
      "τ = R × C",
      `${plainOhms(example.resistance)} × ${scientific(example.capacitance)} F = ${scientific(solution.tau)} s = ${formatSeconds(solution.tau)}.`,
    )}
    <p>The exponent in every later equation is (t − t<sub>k</sub>)/τ. Measure t, t<sub>k</sub>, and τ in the same unit, seconds or milliseconds. The quotient is a pure number, so the exponential is valid. Here τ = ${formatMs(solution.tau)}, and the switching times are also in milliseconds.</p>
  `;
}

function powerMarks(power: number): string {
  const map: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return String(power)
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
}

function piecewiseHtml(solution: PulseSolution): string {
  const example = solution.example;
  const initial = voltsGiven(example.initialLevel);
  const pulse = voltsGiven(example.pulseLevel);
  const direction =
    example.pulseLevel > example.initialLevel
      ? "The pulse is positive-going."
      : example.pulseLevel < example.initialLevel
        ? "The pulse is negative-going."
        : "The pulse level equals the initial level, so the input does not change.";
  const rows =
    example.ta <= 0
      ? `<span>${pulse}&nbsp;&nbsp;for 0 ≤ t &lt; ${formatMs(example.tb)}</span><span>${initial}&nbsp;&nbsp;for t ≥ ${formatMs(example.tb)}</span>`
      : `<span>${initial}&nbsp;&nbsp;for 0 ≤ t &lt; ${formatMs(example.ta)}</span><span>${pulse}&nbsp;&nbsp;for ${formatMs(example.ta)} ≤ t &lt; ${formatMs(example.tb)}</span><span>${initial}&nbsp;&nbsp;for t ≥ ${formatMs(example.tb)}</span>`;
  const lead =
    example.ta <= 0
      ? `For t &lt; 0 the input is already ${initial}. The first switching event is the change at t = 0. The second is the return at t = ${formatMs(example.tb)}. After that the input stays constant.`
      : `The input is constant on each piece. It switches at t<sub>a</sub> = ${formatMs(example.ta)} and at t<sub>b</sub> = ${formatMs(example.tb)}, then stays at the original level.`;
  return `
    <p>${direction} ${lead}</p>
    <div class="eq cases-eq"><span>V<sub>in</sub>(t) =</span><span class="cases">${rows}</span></div>
    <p class="subst">The level after t<sub>b</sub> is the initial level, ${initial}. This is one finite pulse, not a repeating waveform, so there is no period and no frequency to substitute.</p>
  `;
}

function intervalById(solution: PulseSolution, id: IntervalModel["id"]): IntervalModel | null {
  return solution.intervals.find((interval) => interval.id === id) ?? null;
}

function ratioSentence(t: number, tk: number, tau: number): string {
  const x = (t - tk) / tau;
  return `(${formatMsNumber(t)} ms − ${formatMsNumber(tk)} ms) / ${formatMsNumber(tau)} ms = ${formatDim(x)}`;
}

function evaluated(label: string, value: number): string {
  return `${label} = ${signedFixed(value, 6)} V, which is ${answerVolts(value)} to three decimals.`;
}

function continuityIntro(filter: FilterKind): string {
  const jump =
    filter === "hp"
      ? "The high-pass output is the resistor voltage, V<sub>o</sub> = V<sub>in</sub> − V<sub>C</sub>, so it jumps by the same amount as the input: V<sub>o</sub>(t<sub>k</sub><sup>+</sup>) = V<sub>o</sub>(t<sub>k</sub><sup>−</sup>) + V<sub>in</sub>(t<sub>k</sub><sup>+</sup>) − V<sub>in</sub>(t<sub>k</sub><sup>−</sup>)."
      : "The low-pass output is the capacitor voltage, so V<sub>o</sub>(t<sub>k</sub><sup>+</sup>) = V<sub>o</sub>(t<sub>k</sub><sup>−</sup>). The resistor voltage would jump, but that is not the output of this filter.";
  return `<p>The capacitor voltage is the state of the circuit. It cannot jump when the input changes: V<sub>C</sub>(t<sub>k</sub><sup>+</sup>) = V<sub>C</sub>(t<sub>k</sub><sup>−</sup>). ${jump}</p>`;
}

function edgeNumbers(solution: PulseSolution, t: number, filter: FilterKind): string {
  const beforeVin = t === solution.example.ta ? solution.example.initialLevel : solution.example.pulseLevel;
  const afterVin = t === solution.example.ta ? solution.example.pulseLevel : solution.example.initialLevel;
  const vc = t === solution.example.ta ? solution.vcAtTa : solution.vcAtTb;
  const voBefore = filter === "lp" ? vc : beforeVin - vc;
  const voAfter = filter === "lp" ? vc : afterVin - vc;
  const vcLine = `V<sub>C</sub>(${formatMs(t)}<sup>−</sup>) = V<sub>C</sub>(${formatMs(t)}<sup>+</sup>) = ${answerVolts(vc)}.`;
  if (filter === "lp") {
    return `<p>At t = ${formatMs(t)} the input changes from ${voltsGiven(beforeVin)} to ${voltsGiven(afterVin)}. ${vcLine} The low-pass output is continuous, so the displayed value on either side of the edge is V<sub>o</sub> = ${answerVolts(vc)}.</p>`;
  }
  return `
    <p>At t = ${formatMs(t)} the input changes from ${voltsGiven(beforeVin)} to ${voltsGiven(afterVin)}. ${vcLine}</p>
    ${formula(
      "V<sub>o</sub>(t<sup>+</sup>) = V<sub>o</sub>(t<sup>−</sup>) + ΔV<sub>in</sub>",
      `V<sub>o</sub>(${formatMs(t)}<sup>−</sup>) = ${voltsGiven(beforeVin)} − ${signedFixed(vc, 6)} V = ${answerVolts(voBefore)}. V<sub>o</sub>(${formatMs(t)}<sup>+</sup>) = ${voltsGiven(afterVin)} − ${signedFixed(vc, 6)} V = ${answerVolts(voAfter)}. The jump is ${answerVolts(voAfter - voBefore)}, the same change as the input.`,
    )}
  `;
}

function generalEquations(interval: IntervalModel, tau: number, filter: FilterKind): string {
  const tk = formatMs(interval.t0);
  const u = voltsGiven(interval.input);
  const vc0 = signedFixed(interval.vcStart, 6);
  const coeffLp = interval.vcStart - interval.input;
  const coeffHp = interval.input - interval.vcStart;
  const tauLabel = formatMs(tau);
  const shared = formula(
    "V<sub>C</sub>(t) = U + [V<sub>C</sub>(t<sub>k</sub>) − U] exp[−(t − t<sub>k</sub>)/τ]",
    `t<sub>k</sub> = ${tk}, U = ${u}, V<sub>C</sub>(t<sub>k</sub>) = ${vc0} V, and τ = ${tauLabel}.`,
  );
  const numeric = formula(
    `V<sub>C</sub>(t) = ${signedTrimVolts(interval.input)} + [${vc0} − ${parenSigned(signedTrimVolts(interval.input))}] exp[−(t − ${formatMsNumber(interval.t0)} ms)/${formatMsNumber(tau)} ms]`,
    `V<sub>C</sub>(t) = ${signedTrimVolts(interval.input)} + ${signedFixed(coeffLp, 6)} exp[−(t − ${formatMsNumber(interval.t0)} ms)/${formatMsNumber(tau)} ms]. The capacitor moves from ${vc0} V toward ${u}.`,
  );
  if (Math.abs(coeffLp) <= 1e-12) {
    const settled =
      filter === "lp"
        ? `The bracket is zero, so V<sub>C</sub>(t) stays at ${u}. The low-pass output is that same constant.`
        : `The bracket is zero, so V<sub>C</sub>(t) stays at ${u}. Then V<sub>o</sub> = V<sub>in</sub> − V<sub>C</sub> = 0 V for this whole interval.`;
    return `${shared}${numeric}<p>${settled}</p>`;
  }
  if (filter === "lp") {
    return `${shared}${numeric}${formula("V<sub>o</sub>(t) = V<sub>C</sub>(t)", "Low-pass output is the capacitor voltage, so the output uses the same equation.")}`;
  }
  return `
    ${shared}
    ${numeric}
    ${formula(
      "V<sub>o</sub>(t) = [U − V<sub>C</sub>(t<sub>k</sub>)] exp[−(t − t<sub>k</sub>)/τ]",
      `During this constant-input interval, V<sub>o</sub>(t) = ${signedFixed(coeffHp, 6)} exp[−(t − ${formatMsNumber(interval.t0)} ms)/${formatMsNumber(tau)} ms]. That is V<sub>in</sub> − V<sub>C</sub>.`,
    )}
  `;
}

function boundaryHtml(interval: IntervalModel, tau: number, filter: FilterKind): string {
  if (interval.t1 === null || interval.vcEnd === null) return "";
  const x = (interval.t1 - interval.t0) / tau;
  const end = interval.vcEnd;
  return `
    <p>At the end of this interval, t = ${formatMs(interval.t1)}.</p>
    ${formula(
      "(t − t<sub>k</sub>)/τ",
      `${ratioSentence(interval.t1, interval.t0, tau)}. Then exp(−${formatDim(x)}) = ${signedFixed(Math.exp(-Math.min(x, 700)), 6)}.`,
    )}
    <p class="subst">${evaluated(`V<sub>C</sub>(${formatMs(interval.t1)})`, end)} This boundary is carried into the next interval without rounding. ${
      filter === "lp" ? `The low-pass output at this boundary is the same number, ${answerVolts(end)}.` : "The high-pass output at a boundary that is also a switching time is listed on both sides below."
    }</p>
  `;
}

function intervalRange(interval: IntervalModel): string {
  if (interval.t1 === null) return `t ≥ ${formatMs(interval.t0)}`;
  if (interval.t0 <= 0 && interval.id === "before") return `0 ≤ t &lt; ${formatMs(interval.t1)}`;
  return `${formatMs(interval.t0)} ≤ t &lt; ${formatMs(interval.t1)}`;
}

function intervalHtml(solution: PulseSolution, interval: IntervalModel, filter: FilterKind, opensWithEdge: boolean): string {
  const range = intervalRange(interval);
  const edge = opensWithEdge ? edgeNumbers(solution, interval.t0, filter) : "";
  const continuity = opensWithEdge ? "" : `<p>This interval starts from the initial capacitor voltage, not from a switching event.</p>`;
  return `
    <p>Time interval: ${range}.</p>
    <p>The input is constant at U = ${voltsGiven(interval.input)}. The capacitor voltage at the start of the interval is V<sub>C</sub>(${formatMs(interval.t0)}) = ${signedFixed(interval.vcStart, 6)} V. The voltage the capacitor approaches is the constant input, ${voltsGiven(interval.target)}.</p>
    ${continuity}
    ${edge}
    ${generalEquations(interval, solution.tau, filter)}
    ${boundaryHtml(interval, solution.tau, filter)}
  `;
}

function queryHtml(solution: PulseSolution, filter: FilterKind, index: number): string {
  const query = solution.queries[index];
  const t = query.t;
  if (!query.atSwitch) {
    const interval = solution.intervals.find((item) => t >= item.t0 - 1e-12 && (item.t1 === null || t < item.t1 - 1e-12));
    if (!interval) return `<p>t = ${formatMs(t)} is outside the pulse description.</p>`;
    const x = (t - interval.t0) / solution.tau;
    const vc = query.after.vc;
    const vo = filter === "lp" ? query.after.lp : query.after.hp;
    const expValue = Math.exp(-Math.min(Math.max(x, 0), 700));
    const outputLine =
      filter === "lp"
        ? `V<sub>o</sub>(${formatMs(t)}) = V<sub>C</sub>(${formatMs(t)}) = ${answerVolts(vo)}. This time is not a switching instant, so there is only one value.`
        : `V<sub>o</sub>(${formatMs(t)}) = [${signedTrimVolts(interval.input)} − ${parenSigned(signedFixed(interval.vcStart, 6))}] exp(−${formatDim(x)}) = ${answerVolts(vo)}. This time is not a switching instant, so there is only one value.`;
    return `
      <h4>t = ${formatMs(t)}</h4>
      <p>This instant is inside ${intervalRange(interval)}, where U = ${voltsGiven(interval.input)} and V<sub>C</sub>(t<sub>k</sub>) = ${signedFixed(interval.vcStart, 6)} V.</p>
      ${formula("(t − t<sub>k</sub>)/τ", `${ratioSentence(t, interval.t0, solution.tau)}. exp(−${formatDim(x)}) = ${signedFixed(expValue, 6)}.`)}
      <p class="subst">${evaluated(`V<sub>C</sub>(${formatMs(t)})`, vc)}</p>
      <p class="subst" data-query="${t}" data-side="value" data-filter="${filter}">${outputLine}</p>
    `;
  }

  const vc = query.before.vc;
  const voBefore = filter === "lp" ? query.before.lp : query.before.hp;
  const voAfter = filter === "lp" ? query.after.lp : query.after.hp;
  const which = query.edge === "ta" ? "first" : "second";
  if (filter === "lp") {
    return `
      <h4>t = ${formatMs(t)}</h4>
      <p>This is the ${which} switching time. The input changes from ${voltsGiven(query.before.vin)} to ${voltsGiven(query.after.vin)}. The capacitor voltage stays continuous.</p>
      <p class="subst" data-query="${t}" data-side="continuous" data-filter="lp">${evaluated(`V<sub>C</sub>(${formatMs(t)})`, vc)} The low-pass output equals the capacitor voltage on both sides: V<sub>o</sub>(${formatMs(t)}<sup>−</sup>) = V<sub>o</sub>(${formatMs(t)}<sup>+</sup>) = ${answerVolts(voBefore)}. The displayed answer uses this continuous value.</p>
    `;
  }
  return `
    <h4>t = ${formatMs(t)}</h4>
    <p>This is the ${which} switching time. Show both sides. The capacitor voltage does not jump. The resistor voltage does.</p>
    ${formula(
      "V<sub>C</sub>(t<sup>+</sup>) = V<sub>C</sub>(t<sup>−</sup>)",
      `V<sub>C</sub> = ${signedFixed(vc, 6)} V = ${answerVolts(vc)} to three decimals.`,
    )}
    <p class="subst" data-query="${t}" data-side="before" data-filter="hp">Just before the switch, V<sub>in</sub>(${formatMs(t)}<sup>−</sup>) = ${voltsGiven(query.before.vin)} and V<sub>o</sub>(${formatMs(t)}<sup>−</sup>) = ${answerVolts(voBefore)}. The displayed answer on the left side of the edge is ${answerVolts(voBefore)}.</p>
    <p class="subst" data-query="${t}" data-side="after" data-filter="hp">Just after the switch, V<sub>in</sub>(${formatMs(t)}<sup>+</sup>) = ${voltsGiven(query.after.vin)} and V<sub>o</sub>(${formatMs(t)}<sup>+</sup>) = ${answerVolts(voAfter)}. The displayed answer on the right side of the edge is ${answerVolts(voAfter)}. This is the value that starts the next interval.</p>
    <p>The jump is V<sub>o</sub>(t<sup>+</sup>) − V<sub>o</sub>(t<sup>−</sup>) = ${answerVolts(voAfter - voBefore)}, equal to V<sub>in</sub>(t<sup>+</sup>) − V<sub>in</sub>(t<sup>−</sup>) = ${answerVolts(query.after.vin - query.before.vin)}.</p>
  `;
}

function maxHtml(solution: PulseSolution): string {
  const example = solution.example;
  const during = intervalById(solution, "during");
  if (!during || during.vcEnd === null) return "";
  const duration = example.tb - example.ta;
  const x = duration / solution.tau;
  const fraction = 1 - Math.exp(-Math.min(x, 700));
  const target = during.target;
  const start = during.vcStart;
  const end = during.vcEnd;
  const gap = target - end;
  const where =
    solution.maxHeld
      ? `The capacitor voltage stays at ${answerVolts(solution.maxCapacitor)} for the whole pulse, so that constant value is the maximum.`
      : solution.maxCapacitorTime === example.tb
        ? `On this interval the capacitor moves toward ${voltsGiven(target)} and does not turn around. The maximum is the value at the end of the pulse, t = ${formatMs(example.tb)}.`
        : `On this interval the capacitor moves away from its starting voltage toward ${voltsGiven(target)}. The maximum is the starting value, at t = ${formatMs(example.ta)}.`;
  const unfinished =
    Math.abs(target - start) > 1e-9 && Math.abs(gap) > Math.max(0.01, 0.01 * Math.abs(target - start))
      ? `<p>The pulse lasts ${formatMs(duration)} = ${formatDim(x)} τ. The completed fraction of the change from ${voltsGiven(start)} toward ${voltsGiven(target)} is 1 − exp(−${formatDim(x)}) = ${signedFixed(fraction, 3)}. V<sub>C</sub>(${formatMs(example.tb)}) = ${answerVolts(end)}, while the charging target is ${voltsGiven(target)}. The remaining gap is ${answerVolts(gap)}. About 5τ = ${formatMs(5 * solution.tau)} would be needed to get within 1% of the target. The pulse ends first, so the capacitor never reaches ${voltsGiven(target)}. After t = ${formatMs(example.tb)} the input returns to ${voltsGiven(example.initialLevel)} and the capacitor voltage moves toward that level instead.</p>`
      : `<p>The pulse lasts ${formatMs(duration)} = ${formatDim(x)} τ. That is long enough for the capacitor to finish at ${answerVolts(end)}, next to the target ${voltsGiven(target)}.</p>`;
  return `
    <h4>Maximum capacitor voltage during the pulse</h4>
    <p>${where}</p>
    ${unfinished}
    <p class="subst" data-result="vc-max">Maximum capacitor voltage = ${answerVolts(solution.maxCapacitor)} at t = ${formatMs(solution.maxCapacitorTime)}.</p>
  `;
}

function answersHtml(solution: PulseSolution, filter: FilterKind): string {
  const example = solution.example;
  const rows = solution.queries
    .map((query) => {
      if (filter === "lp" || !query.atSwitch) {
        const vo = filter === "lp" ? query.after.lp : query.after.hp;
        const side = query.atSwitch ? "continuous, t− and t+ agree" : "not a switching time";
        return `<div data-result="vo" data-time="${query.t}" data-side="${query.atSwitch ? "continuous" : "value"}"><dt>V<sub>o</sub>(${formatMs(query.t)})</dt><dd>${answerVolts(vo)}</dd><dd class="side">${side}</dd></div>`;
      }
      const before = answerVolts(query.before.hp);
      const after = answerVolts(query.after.hp);
      return `
        <div data-result="vo" data-time="${query.t}" data-side="before"><dt>V<sub>o</sub>(${formatMs(query.t)}<sup>−</sup>)</dt><dd>${before}</dd><dd class="side">just before the switch</dd></div>
        <div data-result="vo" data-time="${query.t}" data-side="after"><dt>V<sub>o</sub>(${formatMs(query.t)}<sup>+</sup>)</dt><dd>${after}</dd><dd class="side">just after the switch</dd></div>
      `;
    })
    .join("");
  const max = example.askMaxCapacitor
    ? `<div data-result="vc-max" data-time="${solution.maxCapacitorTime}"><dt>Maximum V<sub>C</sub> during the pulse</dt><dd>${answerVolts(solution.maxCapacitor)}</dd><dd class="side">at t = ${formatMs(solution.maxCapacitorTime)}</dd></div>`
    : "";
  return `
    <p>The graph shows the input in blue and the ${kindName(filter)} output in orange on one voltage scale. Switching times and requested times are marked. Calculated output values are labeled in three decimals.</p>
    <dl class="answer-box">
      <div data-result="tau"><dt>Time constant</dt><dd>${formatMs(solution.tau)}</dd><dd class="side">τ = RC</dd></div>
      ${rows}
      ${max}
    </dl>
    ${example.askMaxCapacitor ? maxHtml(solution) : ""}
  `;
}

function givenHtml(solution: PulseSolution, filter: FilterKind): string {
  const example = solution.example;
  const where = filter === "lp" ? "the capacitor voltage, V<sub>o</sub> = V<sub>C</sub>" : "the resistor voltage, V<sub>o</sub> = V<sub>in</sub> − V<sub>C</sub>";
  return `
    <dl class="stats four">
      <div><dt>Resistance</dt><dd>${formatResistance(example.resistance, example.resistanceUnit)}</dd></div>
      <div><dt>Capacitance</dt><dd>${formatCapacitance(example.capacitance, example.capacitanceUnit)}</dd></div>
      <div><dt>Initial input</dt><dd>${voltsGiven(example.initialLevel)}</dd></div>
      <div><dt>Pulse level</dt><dd>${voltsGiven(example.pulseLevel)}</dd></div>
      <div><dt>First switch t<sub>a</sub></dt><dd>${formatMs(example.ta)}</dd></div>
      <div><dt>Second switch t<sub>b</sub></dt><dd>${formatMs(example.tb)}</dd></div>
      <div><dt>Initial V<sub>C</sub>(0)</dt><dd>${voltsGiven(example.vc0)}</dd></div>
      <div><dt>Output</dt><dd>${filter === "lp" ? "Low-pass, across C" : "High-pass, across R"}</dd></div>
    </dl>
    <p>${escapeHtml(example.title)}. ${initialSentence(solution)}</p>
    <p>The ${kindName(filter)} output is ${where}. The input returns to ${voltsGiven(example.initialLevel)} at the second switch and then stays constant. Part (b) asks for the output at ${joinTimes(example.requestedTimes)}.${
      example.askMaxCapacitor ? " Part (c) asks for the maximum capacitor voltage during the pulse." : ""
    }</p>
  `;
}

export function renderSection(solution: PulseSolution, filter: FilterKind, step: StepId, letter: string, current: boolean): string {
  let body = "";
  if (step === "given") body = givenHtml(solution, filter);
  else if (step === "tau") body = tauHtml(solution);
  else if (step === "piecewise") body = piecewiseHtml(solution);
  else if (step === "before") {
    const interval = intervalById(solution, "before");
    body = interval
      ? `${continuityIntro(filter)}${intervalHtml(solution, interval, filter, false)}`
      : "<p>The first transition is at t = 0, so there is no interval before it.</p>";
  } else if (step === "during") {
    const interval = intervalById(solution, "during");
    const intro = solution.intervals.some((item) => item.id === "before") ? "" : continuityIntro(filter);
    body = interval ? `${intro}${intervalHtml(solution, interval, filter, true)}` : "";
  } else if (step === "after") {
    const interval = intervalById(solution, "after");
    body = interval
      ? `${continuityIntro(filter)}${intervalHtml(solution, interval, filter, true)}<p>The expression remains in force for every later time. Requested times in this interval are substituted in the next step.</p>`
      : "";
  } else if (step === "queries") {
    body =
      solution.queries.length === 0
        ? "<p>No calculation times were entered.</p>"
        : solution.queries.map((_, index) => queryHtml(solution, filter, index)).join("");
  } else {
    body = answersHtml(solution, filter);
  }
  const title = {
    given: "Given values and initial condition",
    tau: "Time constant",
    piecewise: "Input voltage as a piecewise function",
    before: "Response before the first transition",
    during: "Response between the two transitions",
    after: "Response after the second transition",
    queries: "Output at the requested times",
    answers: "Final answers",
  }[step];
  return `<section class="explain${current ? " is-current" : ""}" id="step-${step}" data-step="${step}"><h3>${letter}. ${title}</h3>${body}</section>`;
}
