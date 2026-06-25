import { GraduationCap } from "lucide-react";
import Link from "next/link";

import SidebarNavigation from "@/app/_components/Dashboard/Sidebar/components/Navigation";
import type { SidebarContentProps } from "@/app/_components/Dashboard/Sidebar/components/SidebarContent/types";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { capitalize } from "@/lib/utils/capitalize";
import { cn } from "@/lib/utils/cn";
import getInitials from "@/lib/utils/user/getInitials";
import getUserName from "@/lib/utils/user/getUserName";

export const SidebarContent = ({
	name,
	role,
	isInstructor,
	reviewsCount,
	unreadMessages,
	collapsed = false,
}: SidebarContentProps) => {
	return (
		<div className="flex h-full flex-col">
			<div
				className={cn(
					"flex h-16 items-center border-sidebar-border border-b",
					collapsed ? "justify-center" : "px-6",
				)}
			>
				<Link
					className="flex items-center gap-2"
					href={
						isInstructor ? INSTRUCTOR_URLS.dashboard : STUDENT_URLS.dashboard
					}
				>
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
						<GraduationCap className="h-5 w-5 text-sidebar-primary-foreground" />
					</div>
					{!collapsed && (
						<span className="whitespace-nowrap font-semibold text-lg text-sidebar-foreground">
							{isInstructor ? "Instructor" : "EduPlatform"}
						</span>
					)}
				</Link>
			</div>

			<SidebarNavigation
				collapsed={collapsed}
				isInstructor={isInstructor}
				reviewsCount={reviewsCount}
				unreadMessages={unreadMessages}
			/>

			<div
				className={cn(
					"border-sidebar-border border-t",
					collapsed ? "p-2" : "p-3",
				)}
			>
				<div
					className={cn(
						"flex items-center rounded-lg",
						collapsed
							? "justify-center"
							: "gap-3 bg-sidebar-accent/50 px-3 py-2",
					)}
				>
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary font-semibold text-sidebar-primary-foreground text-sm">
						{getInitials(name)}
					</div>
					{!collapsed && (
						<div className="flex-1 overflow-hidden">
							<p className="truncate font-medium text-sidebar-foreground text-sm">
								{getUserName(name)}
							</p>
							<p className="truncate text-sidebar-foreground/60 text-xs">
								{capitalize(role.toLowerCase())}
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
