import { CheckCircle2 } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { ObjectiveCardProps } from "@/app/_components/Course/components/BrowseCourse/ObjectivesCard/types";

const ObjectivesCard = ({ objectives }: ObjectiveCardProps) => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>What you&apos;ll learn</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-2">
					{objectives.map((item) => (
						<div className="flex gap-2" key={item}>
							<CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
							<span className="text-sm">{item}</span>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
};

export default ObjectivesCard;
