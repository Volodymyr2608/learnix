import { env } from "@/lib/env";

/**
 * FR-P20 / C24: enforced on the server, not only in the UI.
 *
 * Compared as a string on purpose: lib/env.js transforms the value to a boolean,
 * but with SKIP_ENV_VALIDATION (tests, Docker builds) env carries the raw string.
 * Both `true` and `"true"` mean on; anything else is off.
 */
export const isStudentRefundEnabled = (): boolean =>
	String(env.REFUND_STUDENT_ENABLED) === "true";
