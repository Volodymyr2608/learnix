import { formatDistanceToNow } from "date-fns";
import type { StudentStatus } from "@/server/entities/instructor/students";

export function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.map((n) => n[0])
		.join("")
		.toUpperCase();
}

export function formatLastActive(date: Date | null): string {
	if (!date) return "Never";
	return formatDistanceToNow(date, { addSuffix: true });
}

export function statusBadgeClass(status: StudentStatus): string {
	switch (status) {
		case "active":
			return "bg-green-500/10 text-green-600 border-green-500/20";
		case "completed":
			return "bg-blue-500/10 text-blue-600 border-blue-500/20";
		default:
			return "bg-gray-500/10 text-gray-600 border-gray-500/20";
	}
}
