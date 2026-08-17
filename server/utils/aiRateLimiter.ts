const MAX_MSG_LENGTH = 2000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const EVICT_THRESHOLD = 5_000;

const windows = new Map<string, { count: number; resetAt: number }>();

/**
 * A union rather than a bare string so a missed call site is a type error: the
 * three chat routes shared one bucket keyed on userId alone, which meant using
 * the tutor spent the same account's course-builder allowance.
 *
 * Still per-process — this narrows the blast radius of a shared bucket, it does
 * not make the limiter distributed. See security.md S13 §17 / threat-model R3.
 */
export type AiRateLimitFeature = "lessonAI" | "courseAI" | "learningPathAI";

export function checkAiRateLimit(
	userId: string,
	feature: AiRateLimitFeature,
): boolean {
	const now = Date.now();
	const windowKey = `${userId}:${feature}`;

	if (windows.size > EVICT_THRESHOLD) {
		for (const [key, entry] of windows) {
			if (now >= entry.resetAt) windows.delete(key);
		}
	}

	const entry = windows.get(windowKey);

	if (!entry || now >= entry.resetAt) {
		windows.set(windowKey, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}

	if (entry.count >= MAX_REQUESTS) return false;

	entry.count++;
	return true;
}

export function validateMessageLength(message: string): boolean {
	return message.length <= MAX_MSG_LENGTH;
}
