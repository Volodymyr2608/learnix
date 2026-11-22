/** What `releasePayment` did with one payment (ADR-037 §2). */
export type ReleaseOutcome =
	| { kind: "released"; paymentId: string }
	| { kind: "already_transferred"; paymentId: string }
	| { kind: "not_eligible"; paymentId: string }
	| { kind: "waiting_for_stripe"; paymentId: string }
	| { kind: "charge_not_payable"; paymentId: string }
	| { kind: "failed"; paymentId: string; error: string };

export type ReleaseOutcomeKind = ReleaseOutcome["kind"];
