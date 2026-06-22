import { CreditCard } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";

const BillingEmptyState = () => {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-border border-dashed bg-card py-20 text-center">
			<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
				<CreditCard className="h-8 w-8 text-primary" />
			</div>
			<h2 className="mt-5 font-semibold text-lg">No purchases yet</h2>
			<p className="mt-1.5 max-w-sm text-muted-foreground text-sm">
				When you buy a course, your receipts and invoices will appear here.
			</p>
			<Button asChild className="mt-6">
				<Link href={STUDENT_URLS.browseCourse}>Browse courses</Link>
			</Button>
		</div>
	);
};

export default BillingEmptyState;
