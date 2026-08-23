/**
 * Error classes whose own fields carry payload, reduced to the class name alone.
 *
 * One constant, two consumers — `projectError` (which drops their scalar fields) and
 * `beforeSend`'s backstop re-scan — so adding a fifth leaky dependency is a one-line
 * change covered by an existing test, not a second hand-maintained branch.
 *
 * Why each is here:
 *  - UpstashError: the message is built as
 *    `${body.error}, command was: ${JSON.stringify(req.body)}`, and an `eval` body
 *    embeds the prefixed keys — which contain the userId, and the courseId on a
 *    scoped window. distributed-ai-rate-limiter AC 25 already imposes class-only on
 *    stdout for exactly this; a third-party processor does not get a weaker rule.
 *  - PrismaClient*: PrismaClientValidationError renders the offending call with its
 *    argument values (the email on a user.create, the price on a course update), and
 *    raw-query failures carry SQL text with bound parameters.
 *  - StripeError / ResendSendError: provider-authored message text, and Resend's
 *    address-validation failures embed the recipient address.
 *
 * See ../../docs/specs/features/error-observability/spec.md AC 15 and security.md S2.
 */
export const CLASS_DENYLIST = [
	"UpstashError",
	"PrismaClient",
	"StripeError",
	"ResendSendError",
] as const;

export const isDenylisted = (className: string): boolean =>
	CLASS_DENYLIST.some(
		(entry) =>
			className === entry ||
			(entry === "PrismaClient" && className.startsWith("PrismaClient")),
	);
