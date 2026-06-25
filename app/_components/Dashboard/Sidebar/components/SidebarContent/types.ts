import type { Role } from "@/generated/prisma";

export type SidebarContentProps = {
	name: string;
	role: Role;
	isInstructor: boolean;
	reviewsCount: number;
	unreadMessages: number;
};
