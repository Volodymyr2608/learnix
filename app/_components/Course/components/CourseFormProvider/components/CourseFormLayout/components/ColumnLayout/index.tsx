import type { ColumnLayoutProps } from "@/app/_components/Course/components/CourseFormProvider/components/CourseFormLayout/components/ColumnLayout/types";
import { cn } from "@/lib/utils/cn";

const ColumnLayout = ({ children, className }: ColumnLayoutProps) => {
	return <div className={cn("space-y-4", className)}>{children}</div>;
};

export default ColumnLayout;
