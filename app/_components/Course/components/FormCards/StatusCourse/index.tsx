import { Badge } from "@/app/_components/_shared/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { StatusProps } from "@/app/_components/Course/components/FormCards/StatusCourse/types";
import { STATUS_COURSE } from "@/lib/constants/statusCourse";
import { STATUS_VARIANT } from "@/lib/constants/statusVariants";

const StatusCourse = ({ status }: StatusProps) => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Course Status</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between">
					<span className="text-sm">Current Status</span>
					<Badge variant={STATUS_VARIANT[status]}>
						{STATUS_COURSE[status]}
					</Badge>
				</div>
				<p className="text-muted-foreground text-xs">
					Course will be saved as draft until you publish it
				</p>
			</CardContent>
		</Card>
	);
};

export default StatusCourse;
