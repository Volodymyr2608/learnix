import { isDenylisted } from "./denylist";

/**
 * Verified against @sentry/core@10.70.0: `linkedErrors` walks `cause` with
 * DEFAULT_LIMIT = 5 (build/cjs/integrations/linkederrors.js:8). The projection walks
 * to the same depth so the two cannot drift apart — see build/sdk-defaults.md.
 */
export const LINKED_ERROR_DEPTH = 5;

const CONTEXT_KEYS = [
	"feature",
	"node",
	"path",
	"op",
	"lessonId",
	"courseId",
	"generationId",
	"userId",
] as const;

export type ProjectionContext = Partial<
	Record<(typeof CONTEXT_KEYS)[number], string>
>;

/**
 * The enforcement point for spec.md AC 10 and AC 11.
 *
 * This module NEVER reads `error.message`, at any depth. Three LangChain
 * constructors put untrusted payload directly there — OutputParserException (the
 * entire model output, twice), ToolInputParsingException (the model-generated tool
 * call) and LangGraph's InvalidUpdateError (a courseAI state channel value:
 * userMessage, assistantText, content) — and Prisma puts query arguments there. A
 * denylist would have to anticipate each of those formats; an allowlist need not, so
 * `message` is simply not a field any code path here is capable of copying.
 *
 * It also builds a SYNTHETIC error chain rather than handing Sentry the real one.
 * `linkedErrors` walks `.cause` and turns each link into its own
 * `exception.values[]` entry, so redacting only the top frame would still transmit
 * the raw original from underneath it.
 *
 * Fields are read by name, one at a time, behind a type guard — never spread. That
 * is the same mechanism, and for the same stated reason, as aiGuard/securityLog.ts:
 * there is no field to pass free text into, which is the enforcement rather than a
 * redaction step someone can forget.
 */
class ProjectedError extends Error {
	constructor(
		message: string,
		name: string,
		fields: { code?: string | number; status?: number; lcErrorCode?: string },
		cause?: ProjectedError,
	) {
		super(message, cause ? { cause } : undefined);
		this.name = name;
		if (fields.code !== undefined) Object.assign(this, { code: fields.code });
		if (fields.status !== undefined)
			Object.assign(this, { status: fields.status });
		if (fields.lcErrorCode !== undefined)
			Object.assign(this, { lcErrorCode: fields.lcErrorCode });
	}
}

const classNameOf = (error: unknown): string =>
	(error as { constructor?: { name?: string } })?.constructor?.name ??
	typeof error;

const scalarFieldsOf = (error: unknown, className: string) => {
	// A denylisted class carries payload in its own fields, not only its message.
	if (isDenylisted(className)) return {};

	const source = error as Record<string, unknown> | null;
	const code = source?.code;
	const status = source?.status;
	const lcErrorCode = source?.lc_error_code;

	return {
		code:
			typeof code === "string" || typeof code === "number" ? code : undefined,
		status: typeof status === "number" ? status : undefined,
		lcErrorCode: typeof lcErrorCode === "string" ? lcErrorCode : undefined,
	};
};

/**
 * Reduce any object to the allowlisted scalar keys (AC 10).
 *
 * The parameter is deliberately wider than `ProjectionContext`: `enrichScope` feeds it
 * `DomainError.context`, which is `Record<string, unknown>` at the type level because a
 * service may pass anything there — and several do pass whole DTOs
 * (`instructor.service.ts:85` passes the signup DTO, plaintext password included). The
 * function reads keys BY NAME and requires each surviving value to be a string, so a
 * `dto`, a `query` or any other unlisted key cannot come through whatever its type.
 * That runtime allowlist, not the caller's declared type, is the control.
 */
export const pickAllowlistedContext = (
	context?: ProjectionContext | Readonly<Record<string, unknown>>,
): Record<string, string> => {
	const picked: Record<string, string> = {};
	const source = context as Record<string, unknown> | undefined;
	for (const key of CONTEXT_KEYS) {
		const value = source?.[key];
		if (typeof value === "string" && value.length > 0) picked[key] = value;
	}
	return picked;
};

export const projectError = (
	error: unknown,
	staticMessage: string,
	context?: ProjectionContext,
): { root: Error; extra: Record<string, string> } => {
	// Walk the real chain, bounded by depth and by a seen-set so a circular `cause`
	// cannot spin. Nothing from these objects is read except the allowlisted scalars.
	const levels: unknown[] = [];
	const seen = new Set<unknown>();
	let cursor: unknown = error;
	while (
		cursor !== undefined &&
		cursor !== null &&
		levels.length < LINKED_ERROR_DEPTH &&
		!seen.has(cursor)
	) {
		seen.add(cursor);
		levels.push(cursor);
		cursor = (cursor as { cause?: unknown })?.cause;
	}

	let built: ProjectedError | undefined;
	for (let index = levels.length - 1; index >= 0; index--) {
		const level = levels[index];
		const className = classNameOf(level);
		const name = level instanceof Error ? (level.name ?? className) : className;
		// Only the root carries the caller's static message; deeper links get a
		// server-authored template so the shape of the chain stays visible.
		const message = index === 0 ? staticMessage : `caused by ${className}`;
		built = new ProjectedError(
			message,
			name,
			scalarFieldsOf(level, className),
			built,
		);
	}

	return {
		root: built ?? new ProjectedError(staticMessage, "UnknownError", {}),
		extra: pickAllowlistedContext(context),
	};
};
