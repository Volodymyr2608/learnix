import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { REFUND_POLICY_POINTS } from "@/server/entities/refund/refundPolicy";

/** FR-P21: the refund policy the Purchases tooltip links to (`#refund-policy`). */
export const RefundPolicySection = () => (
	<section className="py-16" id="refund-policy">
		<div className="container mx-auto px-4">
			<Card className="mx-auto max-w-3xl">
				<CardHeader>
					<CardTitle className="text-2xl">Refund policy</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="list-disc space-y-2 pl-6 text-muted-foreground">
						{REFUND_POLICY_POINTS.map((point) => (
							<li key={point}>{point}</li>
						))}
					</ul>
				</CardContent>
			</Card>
		</div>
	</section>
);
