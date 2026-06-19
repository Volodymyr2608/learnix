"use client";

import {
	BarChart3,
	BookOpen,
	CreditCard,
	DollarSign,
	GraduationCap,
	LayoutDashboard,
	MessageSquare,
	PlusCircle,
	Settings,
	Star,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import type { NavigationProps } from "@/app/_components/Dashboard/Sidebar/components/Navigation/types";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { cn } from "@/lib/utils/cn";

interface NavItem {
	title: string;
	href: string;
	icon: React.ComponentType<{ className?: string }>;
	badge?: string;
}

const instructorItems: NavItem[] = [
	{
		title: "Dashboard",
		href: INSTRUCTOR_URLS.dashboard,
		icon: LayoutDashboard,
	},
	{
		title: "My Courses",
		href: INSTRUCTOR_URLS.courses,
		icon: BookOpen,
	},
	{
		title: "Create Course",
		href: INSTRUCTOR_URLS.createCourse,
		icon: PlusCircle,
	},
	{
		title: "Students",
		href: "/instructor/students",
		icon: Users,
	},
	{
		title: "Revenue",
		href: "/instructor/revenue",
		icon: DollarSign,
	},
	{
		title: "Reviews",
		href: INSTRUCTOR_URLS.reviews,
		icon: Star,
	},
	{
		title: "Analytics",
		href: "/instructor/analytics",
		icon: BarChart3,
	},
	{
		title: "Messages",
		href: "/instructor/messages",
		icon: MessageSquare,
		badge: "2",
	},
	{
		title: "Settings",
		href: INSTRUCTOR_URLS.accountSettings,
		icon: Settings,
	},
];

const studentItems: NavItem[] = [
	{
		title: "Dashboard",
		href: STUDENT_URLS.dashboard,
		icon: LayoutDashboard,
	},
	{
		title: "My Courses",
		href: STUDENT_URLS.courses,
		icon: BookOpen,
	},
	{
		title: "Browse Courses",
		href: STUDENT_URLS.browseCourse,
		icon: GraduationCap,
	},
	{
		title: "Progress",
		href: STUDENT_URLS.progress,
		icon: BarChart3,
	},
	{
		title: "Messages",
		href: STUDENT_URLS.messages,
		icon: MessageSquare,
		badge: "3",
	},
	{
		title: "Billing",
		href: STUDENT_URLS.billing,
		icon: CreditCard,
	},
	{
		title: "Settings",
		href: STUDENT_URLS.accountSettings,
		icon: Settings,
	},
];

function formatBadge(count: number): string | undefined {
	if (count <= 0) return undefined;
	return count > 9 ? "9+" : String(count);
}

const SidebarNavigation = ({ isInstructor, reviewsCount }: NavigationProps) => {
	const pathname = usePathname();
	const navItems = isInstructor ? instructorItems : studentItems;

	return (
		<nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
			{navItems.map((item) => {
				const Icon = item.icon;
				const isActive = pathname === item.href;
				const isReviews = item.href === INSTRUCTOR_URLS.reviews;
				const badge = isReviews ? formatBadge(reviewsCount) : item.badge;
				return (
					<Link
						className={cn(
							"flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm transition-colors",
							isActive
								? "bg-sidebar-accent text-sidebar-accent-foreground"
								: "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
						)}
						href={item.href}
						key={item.href}
					>
						<Icon className="h-5 w-5" />
						<span className="flex-1">{item.title}</span>
						{badge && (
							<span
								aria-label={
									isReviews
										? `${reviewsCount} new reviews`
										: `${badge} ${item.title}`
								}
								className="flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs"
								role="img"
							>
								{badge}
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
};

export default SidebarNavigation;
