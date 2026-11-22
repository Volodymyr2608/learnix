/** What `releasePayment` did with one payment (ADR-037 §2). */
export type ReleaseOutcome =
	| { kind: "released"; paymentId: string }
	| { kind: "already_transferred"; paymentId: string }
	| { kind: "not_eligible"; paymentId: string }
	| { kind: "waiting_for_stripe"; paymentId: string }
	| { kind: "charge_not_payable"; paymentId: string }
	| { kind: "failed"; paymentId: string; error: string };

export type ReleaseOutcomeKind = ReleaseOutcome["kind"];

export type PayoutRunCounts = {
	processed: number;
	released: number;
	failed: number;
};

/** What one job run did; ids stay in the PayoutRun row, never in a response (C15). */
export type PayoutRunSummary =
	| ({ status: "completed"; runId: string } & PayoutRunCounts)
	| { status: "already_running" };
