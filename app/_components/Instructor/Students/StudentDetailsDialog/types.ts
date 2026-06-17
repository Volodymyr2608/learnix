import type { StudentRow } from "@/server/entities/instructor/students";

export type StudentDetailsDialogProps = {
	student: StudentRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};
