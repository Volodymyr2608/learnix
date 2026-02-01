import { Check, FileText } from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { BasicInfoCardProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/BasicInfoCard/types";
import NotYetGenerated from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/NotYetGenerated";
import { cn } from "@/lib/utils/cn";

const BasicInfoCard = ({ courseData, completed }: BasicInfoCardProps) => {
	return (
		<Card className={cn("gap-2", { "opacity-40": !courseData?.title })}>
			<CardHeader>
				<div className="flex items-center gap-2">
					<FileText className="h-4 w-4 text-muted-foreground" />
					<CardTitle className="text-sm">Basic Information</CardTitle>
					{completed && <Check className="ml-auto h-4 w-4 text-green-500" />}
				</div>
			</CardHeader>
			<CardContent className="space-y-2 text-sm">
				{courseData?.title ? (
					<>
						<div>
							<span className="text-muted-foreground">Title: </span>
							<span className="font-medium">{courseData.title}</span>
						</div>
						<div>
							<span className="text-muted-foreground">Subtitle: </span>
							<span>{courseData.subtitle}</span>
						</div>
						<div>
							<span className="text-muted-foreground">Description: </span>
							<span>{courseData.description}</span>
						</div>
						<div className="mt-2 flex flex-wrap gap-2">
							<Badge variant="secondary">{courseData.level}</Badge>
							<Badge variant="secondary">{courseData.category}</Badge>
							<Badge variant="secondary">{courseData.language}</Badge>
							<Badge variant="secondary">{courseData.duration}</Badge>
						</div>
					</>
				) : (
					<NotYetGenerated />
				)}
			</CardContent>
		</Card>
	);
};

export default BasicInfoCard;
