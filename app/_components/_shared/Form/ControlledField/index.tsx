import type { FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { ControlledFieldProps } from "@/app/_components/_shared/Form/ControlledField/types";
import InputPassword from "@/app/_components/_shared/Form/InputPassword";
import {
	Field,
	FieldError,
	FieldLabel,
} from "@/app/_components/_shared/ui/field";
import { Input } from "@/app/_components/_shared/ui/input";

const ControlledField = <T extends FieldValues>({
	control,
	name,
	label,
	placeholder,
	type = "text",
	autoComplete = "off",
	inputProps,
}: ControlledFieldProps<T>) => {
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

					{type === "text" && (
						<Input
							{...field}
							aria-invalid={fieldState.invalid}
							autoComplete={autoComplete}
							id={name}
							placeholder={placeholder}
							type={type}
							{...inputProps}
						/>
					)}

					{type === "password" && (
						<InputPassword
							{...field}
							aria-invalid={fieldState.invalid}
							autoComplete={autoComplete}
							id={name}
							placeholder={placeholder}
							{...inputProps}
						/>
					)}

					{fieldState.error && <FieldError errors={[fieldState.error]} />}
				</Field>
			)}
		/>
	);
};

export default ControlledField;
