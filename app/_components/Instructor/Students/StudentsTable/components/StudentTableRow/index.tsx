import { Eye, Mail, MoreHorizontal } from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/_components/_shared/ui/dropdown-menu";
import { Progress } from "@/app/_components/_shared/ui/progress";
import {
	formatLastActive,
	getInitials,
	statusBadgeClass,
} from "../../../utils";
import { EnrolledCoursesCell } from "../EnrolledCoursesCell";
import type { StudentTableRowProps } from "./types";

export function StudentTableRow({
	student,
	onViewDetails,
}: StudentTableRowProps) {
	return (
		<tr className="border-b last:border-0 hover:bg-muted/30">
			<td className="px-6 py-4">
				<div className="flex items-center gap-3">
					<Avatar className="h-10 w-10">
						<AvatarImage alt={student.name} src={student.image || undefined} />
						<AvatarFallback className="bg-primary/10 text-primary">
							{getInitials(student.name)}
						</AvatarFallback>
					</Avatar>
					<div>
						<p className="font-medium">{student.name}</p>
						<p className="text-muted-foreground text-sm">{student.email}</p>
					</div>
				</div>
			</td>
			<td className="px-6 py-4">
				<EnrolledCoursesCell courses={student.courses} />
			</td>
			<td className="px-6 py-4">
				<div className="flex items-center gap-3">
					<Progress className="w-24" value={student.overallProgress} />
					<span className="font-medium text-sm">
						{student.overallProgress}%
					</span>
				</div>
			</td>
			<td className="px-6 py-4">
				<span className="text-muted-foreground text-sm">
					{formatLastActive(student.lastActiveAt)}
				</span>
			</td>
			<td className="px-6 py-4">
				<Badge className={statusBadgeClass(student.status)} variant="outline">
					{student.status.charAt(0).toUpperCase() + student.status.slice(1)}
				</Badge>
			</td>
			<td className="px-6 py-4 text-right">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => onViewDetails(student)}>
							<Eye className="mr-2 h-4 w-4" />
							View Details
						</DropdownMenuItem>
						<DropdownMenuItem disabled>
							<Mail className="mr-2 h-4 w-4" />
							Send Message
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</td>
		</tr>
	);
}
