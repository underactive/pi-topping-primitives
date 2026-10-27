/**
 * Readers over a resolved answer set. A host names its questions, so a missing
 * or malformed answer is a normal outcome rather than an exception: the reader
 * returns `undefined` and the host decides what that means.
 *
 * Contract:
 * - `choice` answers are returned only when the choice is a string and both the
 *   confidence and every probability are finite values within [0, 1].
 * - `bool` answers are returned only when the probability is within [0, 1].
 * - `score` answers are returned only when the score is finite.
 */
import type { ClassifierAnswer } from "@earendil-works/pi-ai";
import { isProbability } from "./classify.js";

export type Answers = Record<string, ClassifierAnswer>;

export interface ChoiceAnswer {
	choice: string;
	confidence: number;
	probabilities: Record<string, number>;
}

export interface BoolAnswer {
	probability: number;
}

export interface ScoreAnswer {
	score: number;
	confidence: number;
}

/** One `choice` question's answer, or undefined when it is absent or malformed. */
export function choiceAnswer(
	answers: Answers,
	key: string,
): ChoiceAnswer | undefined {
	const answer = answers[key];
	if (answer?.type !== "choice") return undefined;
	if (typeof answer.choice !== "string" || answer.choice === "")
		return undefined;
	if (!isProbability(answer.confidence)) return undefined;
	const probabilities: Record<string, number> = {};
	for (const [name, probability] of Object.entries(answer.probabilities)) {
		if (isProbability(probability)) probabilities[name] = probability;
	}
	return {
		choice: answer.choice,
		confidence: answer.confidence,
		probabilities,
	};
}

/** One `bool` question's answer, or undefined when it is absent or malformed. */
export function boolAnswer(
	answers: Answers,
	key: string,
): BoolAnswer | undefined {
	const answer = answers[key];
	if (answer?.type !== "bool") return undefined;
	if (!isProbability(answer.probability)) return undefined;
	return { probability: answer.probability };
}

/** One `score` question's answer, or undefined when it is absent or malformed. */
export function scoreAnswer(
	answers: Answers,
	key: string,
): ScoreAnswer | undefined {
	const answer = answers[key];
	if (answer?.type !== "score") return undefined;
	if (typeof answer.score !== "number" || !Number.isFinite(answer.score))
		return undefined;
	if (!isProbability(answer.confidence)) return undefined;
	return { score: answer.score, confidence: answer.confidence };
}
