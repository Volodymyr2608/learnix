import { Check, Target } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import NotYetGenerated from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/NotYetGenerated";
import type { ObjectiveCardProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/ObjectivesCard/types";
import type { RequirementsCardProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/RequirementsCard/types";
import { cn } from "@/lib/utils/cn";

const RequirementsCard = ({
	requirements,
	completed,
}: RequirementsCardProps) => {
	return (
		<Card className={cn("gap-2", { "opacity-40": requirements.length === 0 })}>
			<CardHeader>
				<div className="flex items-center gap-2">
					<Target className="h-4 w-4 text-muted-foreground" />
					<CardTitle className="text-sm">Requirements</CardTitle>
					{completed && <Check className="ml-auto h-4 w-4 text-green-500" />}
				</div>
			</CardHeader>
			<CardContent className="text-sm">
				{requirements.length > 0 ? (
					<ul className="space-y-1.5">
						{requirements.map((obj) => (
							<li className="flex items-start gap-2" key={obj}>
								<Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
								<span>{obj}</span>
							</li>
						))}
					</ul>
				) : (
					<NotYetGenerated />
				)}
			</CardContent>
		</Card>
	);
};

export default RequirementsCard;
