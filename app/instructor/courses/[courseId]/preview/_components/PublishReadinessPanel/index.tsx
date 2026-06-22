import { CheckCircle2, Circle } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import type { PublishReadinessPanelProps } from "./types";

export function PublishReadinessPanel({
	readiness,
}: PublishReadinessPanelProps) {
	return (
		<Card className="p-6">
			<h2 className="mb-1 font-bold text-xl">Publish readiness</h2>
			<p className="mb-4 text-muted-foreground text-sm">
				{readiness.ready
					? "All set — this course is ready to publish."
					: "Complete these before publishing:"}
			</p>
			<ul className="space-y-2">
				{readiness.items.map((item) => (
					<li className="flex items-center gap-2 text-sm" key={item.id}>
						{item.met ? (
							<CheckCircle2
								aria-label="Done"
								className="h-4 w-4 text-green-600"
							/>
						) : (
							<Circle
								aria-label="Not done"
								className="h-4 w-4 text-muted-foreground"
							/>
						)}
						<span className={item.met ? "text-muted-foreground" : ""}>
							{item.label}
						</span>
					</li>
				))}
			</ul>
		</Card>
	);
}
