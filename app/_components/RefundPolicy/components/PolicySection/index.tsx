import { Check } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { PolicySectionProps } from "./types";

/** FR-P21: one part of the refund policy — an icon, a title and its rules. */
export const PolicySection = ({
	id,
	icon: Icon,
	title,
	points,
}: PolicySectionProps) => (
	<Card className="scroll-mt-24" id={id}>
		<CardHeader>
			<CardTitle className="flex items-center gap-3 text-xl">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<Icon className="h-5 w-5" />
				</span>
				{title}
			</CardTitle>
		</CardHeader>
		<CardContent>
			<ul className="space-y-3">
				{points.map((point) => (
					<li className="flex gap-3 text-muted-foreground" key={point}>
						<Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
						<span>{point}</span>
					</li>
				))}
			</ul>
		</CardContent>
	</Card>
);
