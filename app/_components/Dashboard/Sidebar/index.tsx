import { MobileSidebarSheet } from "@/app/_components/Dashboard/Sidebar/components/MobileSidebarSheet";
import { SidebarContent } from "@/app/_components/Dashboard/Sidebar/components/SidebarContent";
import { Role } from "@/generated/prisma";
import getNewReviewsCount from "@/lib/requests/instructor/getNewReviewsCount";
import getUnreadMessagesCount from "@/lib/requests/messages/getUnreadMessagesCount";
import requireAuth from "@/lib/utils/user/requireAuth";
import { getSession } from "@/server/better-auth/server";

const DashboardSidebar = async () => {
	const { user } = requireAuth(await getSession());

	const { name, role } = user;
	const isInstructor = role === Role.INSTRUCTOR;
	const [reviewsCount, unreadMessages] = await Promise.all([
		isInstructor ? getNewReviewsCount() : Promise.resolve(0),
		getUnreadMessagesCount(),
	]);

	return (
		<>
			<aside className="fixed top-0 left-0 z-40 hidden h-screen w-64 border-sidebar-border border-r bg-sidebar md:block">
				<SidebarContent
					isInstructor={isInstructor}
					name={name}
					reviewsCount={reviewsCount}
					role={role}
					unreadMessages={unreadMessages}
				/>
			</aside>
			<MobileSidebarSheet>
				<SidebarContent
					isInstructor={isInstructor}
					name={name}
					reviewsCount={reviewsCount}
					role={role}
					unreadMessages={unreadMessages}
				/>
			</MobileSidebarSheet>
		</>
	);
};

export default DashboardSidebar;
