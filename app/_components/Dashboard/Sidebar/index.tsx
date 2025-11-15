import { GraduationCap } from "lucide-react";
import Link from "next/link";
import Navigation from "@/app/_components/Dashboard/Sidebar/components/Navigation";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getInitials from "@/lib/utils/user/getInitials";
import getUserName from "@/lib/utils/user/getUserName";
import { getSession } from "@/server/better-auth/server";

const DashboardSidebar = async () => {
	const { user } = await getSession();

	const { name } = user;

	return (
		<aside className="fixed top-0 left-0 z-40 h-screen w-64 border-sidebar-border border-r bg-sidebar">
			<div className="flex h-full flex-col">
				{/* Logo */}
				<div className="flex h-16 items-center border-sidebar-border border-b px-6">
					<Link
						className="flex items-center gap-2"
						href={INSTRUCTOR_URLS.dashboard}
					>
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
							<GraduationCap className="h-5 w-5 text-sidebar-primary-foreground" />
						</div>
						<span className="font-semibold text-lg text-sidebar-foreground">
							Instructor
						</span>
					</Link>
				</div>

				<Navigation />

				{/* Footer */}
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
								Instructor
							</p>
						</div>
					</div>
				</div>
			</div>
		</aside>
	);
};

export default DashboardSidebar;
