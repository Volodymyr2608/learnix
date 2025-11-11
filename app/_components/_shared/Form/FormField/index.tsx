import type { FormFieldProps } from "@/app/_components/_shared/Form/FormField/types";
import InputErrorMessage from "@/app/_components/_shared/Form/InputErrorMessage";
import { Input } from "@/app/_components/_shared/ui/input";
import { Label } from "@/app/_components/_shared/ui/label";

const FormField = ({
	name,
	label,
	error,
	type = "text",
	...props
}: FormFieldProps) => {
	return (
		<div className="mt-4 space-y-2">
			{typeof label === "string" ? (
				<Label htmlFor={name}>{label}</Label>
			) : (
				label
			)}
			<Input name={name} type={type} {...props} />
			<InputErrorMessage error={error} name={name} />
		</div>
	);
};

export default FormField;
