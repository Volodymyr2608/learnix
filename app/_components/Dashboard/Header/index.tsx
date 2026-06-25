import { Search } from "lucide-react";
import { Input } from "@/app/_components/_shared/ui/input";
import { DesktopSidebarToggle } from "@/app/_components/Dashboard/Header/components/DesktopSidebarToggle";
import { MobileNavTrigger } from "@/app/_components/Dashboard/Header/components/MobileNavTrigger";
import Notifications from "@/app/_components/Dashboard/Header/components/Notifications";
import UserProfile from "@/app/_components/Dashboard/Header/components/UserProfile";

const DashboardHeader = () => {
	return (
		<header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-border border-b bg-background px-6">
			<MobileNavTrigger />
			<DesktopSidebarToggle />

			<div className="hidden flex-1 sm:block">
				<div className="relative max-w-md">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						placeholder="Search courses, lessons..."
						type="search"
					/>
				</div>
			</div>

			<div className="ml-auto flex items-center gap-2">
				<Notifications />

				<UserProfile />
			</div>
		</header>
	);
};

export default DashboardHeader;
