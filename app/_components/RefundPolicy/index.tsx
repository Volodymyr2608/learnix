import Link from "next/link";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { REFUND_POLICY_SECTIONS } from "@/server/entities/refund/refundPolicy";
import { PolicySection } from "./components/PolicySection";
import { QuickFact } from "./components/QuickFact";
import { PURCHASES_HREF, QUICK_FACTS, SECTION_ICON } from "./utils";

/**
 * FR-P21: the refund policy page — the headline terms, then the full rules by topic, then the
 * way to the Purchases page where a refund is requested (D-2).
 */
export const RefundPolicy = () => (
	<>
		<section className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-background">
			<div className="container mx-auto max-w-3xl px-4 py-16 text-center">
				<Badge className="mb-4">Refund policy</Badge>
				<h1 className="mb-4 font-bold text-4xl tracking-tight">
					Changed your mind about a course?
				</h1>
				<p className="mb-10 text-lg text-muted-foreground">
					Here is when you can get your money back, and how to ask for it.
				</p>
				<div className="grid gap-4 sm:grid-cols-3">
					{QUICK_FACTS.map((fact) => (
						<QuickFact key={fact.value} label={fact.label} value={fact.value} />
					))}
				</div>
			</div>
		</section>

		<section className="py-16">
			<div className="container mx-auto max-w-3xl space-y-6 px-4">
				{REFUND_POLICY_SECTIONS.map((section) => (
					<PolicySection
						icon={SECTION_ICON[section.id]}
						id={section.id}
						key={section.id}
						points={section.points}
						title={section.title}
					/>
				))}

				<div className="flex flex-col items-center gap-4 rounded-xl border bg-muted/40 px-6 py-8 text-center">
					<p className="text-muted-foreground">
						Refunds are requested from the course&apos;s row on your Purchases
						page.
					</p>
					<Button asChild>
						<Link href={PURCHASES_HREF}>Go to Purchases</Link>
					</Button>
				</div>
			</div>
		</section>
	</>
);
