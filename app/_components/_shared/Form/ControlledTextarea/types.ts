import type { Control, FieldValues, Path } from "react-hook-form";

export type ControlledTextareaProps<T extends FieldValues> = {
	control: Control<T>;
	name: Path<T>;
	label: React.ReactNode;
	placeholder?: string;
	autoComplete?: string;
	rows?: number;
	maxLength?: number;
	minLength?: number;
	required?: boolean;
};
