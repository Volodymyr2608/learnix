import type { PropsWithChildren } from "react";

import DashboardHeader from "@/app/_components/Dashboard/Header";
import DashboardSidebar from "@/app/_components/Dashboard/Sidebar";

const DashboardLayout = ({ children }: PropsWithChildren) => {
	return (
		<div className="flex h-screen overflow-hidden">
			<DashboardSidebar />
			<div className="flex flex-1 flex-col overflow-hidden pl-64">
				<DashboardHeader />
				<main className="flex-1 overflow-y-auto bg-muted/30 p-6">
					{children}
				</main>
			</div>
		</div>
	);
};

export default DashboardLayout;
