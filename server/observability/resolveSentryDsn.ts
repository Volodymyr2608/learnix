/**
 * The environments allowed to run without a DSN.
 *
 * An allowlist, NOT `nodeEnv !== "production"` (spec.md AC 31). lib/env.js's
 * `.default("development")` does not apply under SKIP_ENV_VALIDATION, which that same
 * file recommends for Docker builds — so an unset NODE_ENV would otherwise hand a
 * production deploy a silent no-op.
 */
const DSN_OPTIONAL_ENVS = new Set(["development", "test"]);

/**
 * Exported standalone so the production assertion is testable — a throw at module
 * load is not. Same shape and same reasoning as
 * server/services/_shared/aiLimits/store/index.ts's selectStore.
 *
 * The failure this exists to prevent is the one ADR-027 names for the rate limiter:
 * the most likely way this feature dies is that it is never enabled. A missing
 * production DSN would leave the application exactly as it is today — no reporting at
 * all — with the entire test suite green and nothing to notice.
 */
export const resolveSentryDsn = (
	nodeEnv: string,
	dsn?: string,
): string | undefined => {
	if (dsn) return dsn;

	if (!DSN_OPTIONAL_ENVS.has(nodeEnv)) {
		throw new Error(
			`SENTRY_DSN must be set when NODE_ENV is "${nodeEnv}". Starting without it ` +
				"would leave error reporting silently absent in production, which is this " +
				"feature's most likely failure mode — see docs/specs/features/" +
				"error-observability/security.md S8.",
		);
	}

	return undefined;
};
