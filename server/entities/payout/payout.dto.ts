/** What `releasePayment` did with one payment (ADR-037 §2). */
export type ReleaseOutcome =
	| { kind: "released"; paymentId: string }
	| { kind: "already_transferred"; paymentId: string }
	| { kind: "not_eligible"; paymentId: string }
	| { kind: "waiting_for_stripe"; paymentId: string }
	| { kind: "charge_not_payable"; paymentId: string }
	/** C5 remainder: a refund committed during the release; the transfer was reversed. */
	| { kind: "reversed_after_refund"; paymentId: string }
	| { kind: "failed"; paymentId: string; error: string };

export type ReleaseOutcomeKind = ReleaseOutcome["kind"];

export type PayoutRunCounts = {
	processed: number;
	released: number;
	failed: number;
};

/** Slice 3: the refund work a scheduled run does before releasing. */
export type RefundRunCounts = {
	refundsRetried: number;
	eventsReplayed: number;
};

/** What one job run did; ids stay in the PayoutRun row, never in a response (C15). */
export type PayoutRunSummary =
	| ({ status: "completed"; runId: string } & PayoutRunCounts & RefundRunCounts)
	| { status: "already_running" };

/** FR-A8: one run as the Payouts panel shows it (M1, M2). */
export type PayoutRunView = {
	id: string;
	trigger: "cron" | "manual" | "account_updated";
	startedAt: Date;
	finishedAt: Date | null;
	outcome: "succeeded" | "failed" | "running" | "crashed";
	processed: number;
	released: number;
	failed: number;
	/** Admin-only. */
	error: string | null;
};

/** FR-A8 / AC-F11: everything on the admin Payouts panel. */
export type PayoutPanel = {
	lastRun: PayoutRunView | null;
	lastRunFailures: { paymentId: string; error: string }[];
	lastSuccessAt: Date | null;
	stale: boolean;
	history: PayoutRunView[];
	heldFunds: { count: number; totalCents: number; dueSoonCents: number };
	problems: {
		overdueRefunds: {
			requestId: string;
			paymentId: string;
			amountCents: number;
			approvedAt: Date;
			/** Stripe's text, admin-only (C23). */
			error: string | null;
		}[];
		stuckTransfers: { paymentId: string; amountCents: number; since: Date }[];
		pendingReversals: {
			paymentId: string;
			amountCents: number;
			refundedAt: Date | null;
		}[];
	};
};
