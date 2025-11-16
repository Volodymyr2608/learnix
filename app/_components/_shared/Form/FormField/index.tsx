import type { FormFieldProps } from "@/app/_components/_shared/Form/FormField/types";
import {
	Field,
	FieldError,
	FieldLabel,
} from "@/app/_components/_shared/ui/field";
import { Input } from "@/app/_components/_shared/ui/input";

const FormField = ({
	name,
	label,
	error,
	type = "text",
	...props
}: FormFieldProps) => {
	const isInvalid = !!error;

	return (
		<Field className="gap-2" data-invalid={isInvalid}>
			{typeof label === "string" ? (
				<FieldLabel className="leading-none" htmlFor={name}>
					{label}
				</FieldLabel>
			) : (
				label
			)}
			<Input aria-invalid={isInvalid} name={name} type={type} {...props} />
			<FieldError errors={error ? [{ message: error }] : undefined} />
		</Field>
	);
};

export default FormField;
