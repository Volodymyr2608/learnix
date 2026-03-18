import type { Control, FieldValues, Path } from "react-hook-form";
import type { Input } from "@/app/_components/_shared/ui/input";

export type ControlledFieldProps<T extends FieldValues> = {
	control: Control<T>;
	name: Path<T>;
	label: React.ReactNode;
	placeholder?: string;
	type?: "text" | "email" | "password";
	autoComplete?: string;
	inputProps?: React.ComponentProps<typeof Input>;
};
