import { Badge } from "@/app/_components/_shared/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";

const StatusCourse = () => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Course Status</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between">
					<span className="text-sm">Current Status</span>
					<Badge variant="secondary">Draft</Badge>
				</div>
				<p className="text-muted-foreground text-xs">
					Course will be saved as draft until you publish it
				</p>
			</CardContent>
		</Card>
	);
};

export default StatusCourse;
