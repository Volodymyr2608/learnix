import { CheckCircle2, Circle } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import type {
	PublishReadinessPanelProps,
	ReadinessStatusMessageProps,
} from "./types";

function ReadinessStatusMessage({
	readiness,
	isPublished,
}: ReadinessStatusMessageProps) {
	if (isPublished) {
		return (
			<p className="mb-4 text-muted-foreground text-sm">
				This course is live and published.
			</p>
		);
	}
	if (readiness.ready) {
		return (
			<p className="mb-4 text-muted-foreground text-sm">
				All set — this course is ready to publish.
			</p>
		);
	}
	return (
		<p className="mb-4 text-muted-foreground text-sm">
			Complete these before publishing:
		</p>
	);
}

export function PublishReadinessPanel({
	readiness,
	isPublished,
}: PublishReadinessPanelProps) {
	return (
		<Card className="p-6">
			<h2 className="mb-1 font-bold text-xl">Publish readiness</h2>
			<ReadinessStatusMessage isPublished={isPublished} readiness={readiness} />
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
