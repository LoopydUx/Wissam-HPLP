import { formatGain, formatHz, formatPhase, formatSeconds, formatVolts } from "./format.ts";
import { frequencyResponse, type Phasor, type Waveform } from "./sim.ts";

export interface LessonInput {
  wave: Waveform;
  frequency: number;
  fc: number;
  tau: number;
  amplitude: number;
  offset: number;
  lp: Phasor;
  hp: Phasor;
}

function ratioPhrase(ratio: number): string {
  const pretty = ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2);
  if (Math.abs(ratio - 1) < 0.03) return "at the cutoff";
  if (ratio < 1) return `below the cutoff, at ${pretty} × fc`;
  return `above the cutoff, at ${pretty} × fc`;
}

export function lessonHtml(input: LessonInput): string {
  const ratio = input.frequency / input.fc;
  const where = ratioPhrase(ratio);
  const ideas = [
    "A low-pass filter preserves slow changes and attenuates fast changes.",
    "A high-pass filter attenuates slow changes and responds strongly to rapid changes.",
    "Cutoff is a gradual transition. At fc, a sine wave still keeps about 70.7% of its amplitude.",
    "A DC step makes the low-pass output rise gradually, while the high-pass output jumps initially and then decays toward zero.",
  ];
  const paragraphs: string[] = [];

  if (input.wave === "sine") {
    const speed =
      ratio < 0.7 ? "This input is changing slowly." : ratio > 1.5 ? "This input is changing quickly." : "This input is changing at the cutoff pace.";
    paragraphs.push(
      `${speed} The sine wave is ${where} (f = ${formatHz(input.frequency)}, fc = ${formatHz(input.fc)}).`,
    );
    paragraphs.push(
      `Low-pass gain is ${formatGain(input.lp.gain)}, so the output peak is ${formatVolts(input.amplitude * input.lp.gain)}. The output ${phaseStory("lp", input.lp.phase)}.`,
    );
    paragraphs.push(
      `High-pass gain is ${formatGain(input.hp.gain)}, so the output peak is ${formatVolts(input.amplitude * input.hp.gain)}. The output ${phaseStory("hp", input.hp.phase)}.`,
    );
    if (Math.abs(input.offset) > 0.001) {
      paragraphs.push(
        `The DC offset is ${formatVolts(input.offset)}. The low-pass output keeps that offset. The high-pass output settles around 0 V, so the offset is blocked.`,
      );
    }
  } else if (input.wave === "square") {
    paragraphs.push(
      `This square wave repeats ${where}. Its flat tops are slow parts, and its vertical edges are very fast parts. The fundamental frequency is ${formatHz(input.frequency)}.`,
    );
    if (ratio < 0.7) {
      paragraphs.push(
        "The low-pass output has time to climb to nearly the same levels as the input. The high-pass output spikes when the input jumps, then fades toward 0 V while the input holds still.",
      );
    } else if (ratio > 1.5) {
      paragraphs.push(
        "The low-pass capacitor cannot catch the fast switching, so its output is a small curve around the DC offset. The high-pass output stays close to the square shape and is centered on 0 V.",
      );
    } else {
      paragraphs.push(
        "Near the cutoff, the low-pass output is a rounded square. The high-pass output jumps at each edge and sags while the input is flat.",
      );
    }
  } else {
    const finalV = input.offset + input.amplitude;
    const lpTau = input.offset + input.amplitude * (1 - Math.exp(-1));
    const hpTau = input.amplitude * Math.exp(-1);
    paragraphs.push(
      `The input steps from ${formatVolts(input.offset)} to ${formatVolts(finalV)} at t = 0. The time constant is ${formatSeconds(input.tau)}.`,
    );
    paragraphs.push(
      `Just after the step, the low-pass output is still ${formatVolts(input.offset)} and the high-pass output is ${formatVolts(input.amplitude)}. After one time constant, the low-pass output is ${formatVolts(lpTau)} (about 63% of the way) and the high-pass output is ${formatVolts(hpTau)} (about 37% of the jump remains).`,
    );
    paragraphs.push("The frequency slider does not change the step. The step shape depends on τ = RC.");
  }

  const ideaList = ideas.map((idea) => `<li>${idea}</li>`).join("");
  const now = paragraphs.map((p) => `<p>${p}</p>`).join("");
  return `<ul class="ideas">${ideaList}</ul><h3>Right now</h3>${now}`;
}

function phaseStory(kind: "lp" | "hp", phase: number): string {
  const deg = Math.abs((phase * 180) / Math.PI);
  const text = formatPhase(phase);
  if (deg < 1) return "is almost in phase with the input";
  if (kind === "lp") return `lags the input by ${text.replace("−", "")} (peaks arrive later)`;
  return `leads the input by ${text.replace("+", "")} (peaks arrive earlier)`;
}

export function responses(freq: number, tau: number): { lp: Phasor; hp: Phasor } {
  return {
    lp: frequencyResponse("lp", freq, tau),
    hp: frequencyResponse("hp", freq, tau),
  };
}
