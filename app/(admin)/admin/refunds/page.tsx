import { api } from "@/trpc/server";
import { AppealQueue } from "./_components/AppealQueue";
import { ExceptionRefundForm } from "./_components/ExceptionRefundForm";
import { NeedsReviewList } from "./_components/NeedsReviewList";

/** FR-A1, A6, A7: appeals, exception refunds and Dashboard refunds. The (admin) layout requires ADMIN. */
const RefundsAdminPage = async () => {
	const [appeals, needsReview] = await Promise.all([
		api.refundAdmin.listOpenAppeals(),
		api.refundAdmin.listNeedsReview(),
	]);
	return (
		<div className="space-y-8">
			<div>
				<h1 className="font-bold text-3xl">Refunds</h1>
				<p className="text-muted-foreground">
					Appeals waiting for a decision, exception refunds and Stripe Dashboard
					refunds.
				</p>
			</div>
			<section className="space-y-3">
				<h2 className="font-semibold text-lg">Appeals</h2>
				<AppealQueue appeals={appeals ?? []} />
			</section>
			<section className="space-y-3">
				<h2 className="font-semibold text-lg">Needs review</h2>
				<NeedsReviewList items={needsReview ?? []} />
			</section>
			<section className="space-y-3">
				<h2 className="font-semibold text-lg">Exception refund</h2>
				<ExceptionRefundForm />
			</section>
		</div>
	);
};

export default RefundsAdminPage;
