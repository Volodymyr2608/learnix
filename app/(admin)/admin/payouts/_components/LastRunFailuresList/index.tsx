import type { LastRunFailuresListProps } from "./types";

/**
 * M2 / M8 (review I1): per-payment failures send no email because they are shown here —
 * read-only, with Stripe's text for the admin.
 */
export const LastRunFailuresList = ({ failures }: LastRunFailuresListProps) => {
	if (failures.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No payment failed in the last run.
			</p>
		);
	}
	return (
		<ul className="space-y-1 text-sm">
			{failures.map((failure) => (
				<li key={failure.paymentId}>
					<span className="font-mono text-xs">{failure.paymentId}</span>
					<span className="text-muted-foreground"> — {failure.error}</span>
				</li>
			))}
		</ul>
	);
};
