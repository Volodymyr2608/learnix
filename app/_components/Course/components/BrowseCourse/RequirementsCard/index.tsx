import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { RequirementsCardProps } from "@/app/_components/Course/components/BrowseCourse/RequirementsCard/types";

const RequirementsCard = ({ requirements }: RequirementsCardProps) => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Requirements</CardTitle>
			</CardHeader>
			<CardContent>
				<ul className="space-y-2">
					{requirements.map((req) => (
						<li className="flex gap-2 text-sm" key={req}>
							<span className="text-muted-foreground">-</span>
							<span>{req}</span>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
};

export default RequirementsCard;
