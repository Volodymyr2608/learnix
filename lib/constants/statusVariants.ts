import type { CourseStatus } from "@/generated/prisma";

export const STATUS_VARIANT: Record<CourseStatus, "default" | "secondary"> = {
	draft: "secondary",
	published: "default",
};
