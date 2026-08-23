import { isDenylisted } from "./denylist";

/**
 * Defence in depth (spec.md AC 16/22, security.md S3/S4). The enforcement point is
 * projectError's allowlist — this net exists to catch anything that reaches Sentry by
 * a path that bypassed it, and to strip email addresses, which the projection cannot
 * because they arrive inside values the allowlist legitimately carries.
 */

/** Deliberately broad. A false positive costs a redacted string; a miss costs PII. */
const EMAIL = /[\w.+-]+@[\w.-]+\.\w+/g;
const REDACTED_EMAIL = "[email redacted]";

/** Bounded so an issue title cannot carry a wall of text at whoever reads it. */
const MAX_STRING_LENGTH = 500;

const scrubString = (value: string): string =>
	value
		.replace(EMAIL, REDACTED_EMAIL)
		// Control characters and newlines: an issue title must not be able to fake a
		// second apparent log line, or carry a directive aimed at a human reader.
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
		.replace(/[\u0000-\u001F\u007F]+/g, " ")
		.slice(0, MAX_STRING_LENGTH);

/** Walks every string leaf. Depth-bounded so a cyclic event cannot spin. */
const scrubDeep = (value: unknown, depth = 0): unknown => {
	if (depth > 6) return value;
	if (typeof value === "string") return scrubString(value);
	if (Array.isArray(value))
		return value.map((item) => scrubDeep(item, depth + 1));
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value)) {
			out[key] = scrubDeep(nested, depth + 1);
		}
		return out;
	}
	return value;
};

type SentryEventish = {
	message?: unknown;
	exception?: { values?: Array<{ type?: string; value?: string }> };
	extra?: unknown;
	contexts?: unknown;
	tags?: unknown;
	breadcrumbs?: unknown;
};

/**
 * The backstop for AC 15: if a denylisted class reaches an event by a path that
 * skipped the projection, its message is replaced wholesale rather than scrubbed.
 */
const denylistBackstop = <T extends SentryEventish>(event: T): T => {
	for (const entry of event.exception?.values ?? []) {
		if (entry.type && isDenylisted(entry.type)) {
			entry.value = `${entry.type} (message withheld)`;
		}
	}
	return event;
};

export const redactEvent = <T extends SentryEventish>(event: T): T => {
	denylistBackstop(event);

	if (typeof event.message === "string") {
		event.message = scrubString(event.message);
	}
	for (const entry of event.exception?.values ?? []) {
		if (typeof entry.value === "string") entry.value = scrubString(entry.value);
	}
	if (event.extra !== undefined) event.extra = scrubDeep(event.extra);
	if (event.contexts !== undefined) event.contexts = scrubDeep(event.contexts);
	if (event.tags !== undefined) event.tags = scrubDeep(event.tags);
	if (event.breadcrumbs !== undefined) {
		event.breadcrumbs = scrubDeep(event.breadcrumbs);
	}

	return event;
};
