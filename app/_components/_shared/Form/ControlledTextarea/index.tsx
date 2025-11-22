import type { FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { ControlledTextareaProps } from "@/app/_components/_shared/Form/ControlledTextarea/types";
import {
	Field,
	FieldError,
	FieldLabel,
} from "@/app/_components/_shared/ui/field";
import { Textarea } from "@/app/_components/_shared/ui/textarea";

const ControlledTextarea = <T extends FieldValues>({
	control,
	name,
	label,
	placeholder,
	autoComplete = "off",
	textareaProps,
}: ControlledTextareaProps<T>) => {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field className="gap-2" data-invalid={fieldState.invalid}>
					{typeof label === "string" ? (
						<FieldLabel className="leading-none" htmlFor={name}>
							{label}
						</FieldLabel>
					) : (
						label
					)}

					<Textarea
						{...field}
						aria-invalid={fieldState.invalid}
						autoComplete={autoComplete}
						id={name}
						placeholder={placeholder}
						{...textareaProps}
					/>

					{fieldState.error && <FieldError errors={[fieldState.error]} />}
				</Field>
			)}
		/>
	);
};

export default ControlledTextarea;
