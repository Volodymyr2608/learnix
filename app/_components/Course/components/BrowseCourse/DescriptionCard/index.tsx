import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { DescriptionCardProps } from "@/app/_components/Course/components/BrowseCourse/DescriptionCard/types";

const DescriptionCard = ({ description }: DescriptionCardProps) => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Description</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-sm leading-relaxed">{description}</p>
			</CardContent>
		</Card>
	);
};

export default DescriptionCard;
