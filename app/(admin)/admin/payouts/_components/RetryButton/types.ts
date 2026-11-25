export type RetryKind = "refund" | "release" | "reversal";

export type RetryButtonProps = {
	kind: RetryKind;
	/** A refund request id for `refund`, a payment id otherwise. */
	targetId: string;
};
