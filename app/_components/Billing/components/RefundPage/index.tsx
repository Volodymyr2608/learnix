import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card, CardContent } from "@/app/_components/_shared/ui/card";
import { RefundStateView } from "./components/RefundStateView";
import type { RefundPageProps } from "./types";

/** FR-S3–S20: the refund page of one purchase. */
export const RefundPage = ({
	paymentId,
	courseTitle,
	state,
}: RefundPageProps) => (
	<div className="mx-auto max-w-2xl space-y-6">
		<div className="flex items-center gap-2">
			<Button asChild size="icon" variant="ghost">
				<Link aria-label="Back to purchases" href="/dashboard/billing">
					<ChevronLeft className="h-4 w-4" />
				</Link>
			</Button>
			<div>
				<h1 className="font-bold text-2xl tracking-tight">Refund</h1>
				<p className="text-muted-foreground text-sm">{courseTitle}</p>
			</div>
		</div>
		<Card>
			<CardContent className="pt-6">
				<RefundStateView paymentId={paymentId} state={state} />
			</CardContent>
		</Card>
	</div>
);
