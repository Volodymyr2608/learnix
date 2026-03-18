import type { ReactNode } from "react";

export interface FormFieldProps extends React.ComponentProps<"input"> {
	label: ReactNode;
	name: string;
	error?: string;
	fieldClassName?: string;
}
