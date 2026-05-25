const MAX_MSG_LENGTH = 2000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const EVICT_THRESHOLD = 5_000;

const windows = new Map<string, { count: number; resetAt: number }>();

export function checkAiRateLimit(userId: string): boolean {
	const now = Date.now();

	if (windows.size > EVICT_THRESHOLD) {
		for (const [key, entry] of windows) {
			if (now >= entry.resetAt) windows.delete(key);
		}
	}

	const entry = windows.get(userId);

	if (!entry || now >= entry.resetAt) {
		windows.set(userId, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}

	if (entry.count >= MAX_REQUESTS) return false;

	entry.count++;
	return true;
}

export function validateMessageLength(message: string): boolean {
	return message.length <= MAX_MSG_LENGTH;
}
