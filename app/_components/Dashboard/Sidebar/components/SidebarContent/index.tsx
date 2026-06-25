import { GraduationCap } from "lucide-react";
import Link from "next/link";

import SidebarNavigation from "@/app/_components/Dashboard/Sidebar/components/Navigation";
import type { SidebarContentProps } from "@/app/_components/Dashboard/Sidebar/components/SidebarContent/types";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { capitalize } from "@/lib/utils/capitalize";
import getInitials from "@/lib/utils/user/getInitials";
import getUserName from "@/lib/utils/user/getUserName";

export const SidebarContent = ({
	name,
	role,
	isInstructor,
	reviewsCount,
	unreadMessages,
}: SidebarContentProps) => {
	return (
		<div className="flex h-full flex-col">
			<div className="flex h-16 items-center border-sidebar-border border-b px-6">
				<Link
					className="flex items-center gap-2"
					href={
						isInstructor ? INSTRUCTOR_URLS.dashboard : STUDENT_URLS.dashboard
					}
				>
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
						<GraduationCap className="h-5 w-5 text-sidebar-primary-foreground" />
					</div>
					<span className="font-semibold text-lg text-sidebar-foreground">
						{isInstructor ? "Instructor" : "EduPlatform"}
					</span>
				</Link>
			</div>

			<SidebarNavigation
				isInstructor={isInstructor}
				reviewsCount={reviewsCount}
				unreadMessages={unreadMessages}
			/>

			<div className="border-sidebar-border border-t p-4">
				<div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary font-semibold text-sidebar-primary-foreground text-sm">
						{getInitials(name)}
					</div>
					<div className="flex-1 overflow-hidden">
						<p className="truncate font-medium text-sidebar-foreground text-sm">
							{getUserName(name)}
						</p>
						<p className="truncate text-sidebar-foreground/60 text-xs">
							{capitalize(role.toLowerCase())}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};
