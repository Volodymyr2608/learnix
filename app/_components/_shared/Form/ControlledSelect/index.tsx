import type { FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { ControlledSelectProps } from "@/app/_components/_shared/Form/ControlledSelect/types";
import {
	Field,
	FieldError,
	FieldLabel,
} from "@/app/_components/_shared/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";

const ControlledSelect = <T extends FieldValues>({
	control,
	name,
	label,
	placeholder,
	items,
	id,
}: ControlledSelectProps<T>) => {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Field className="gap-2 [&>*]:w-fit" data-invalid={fieldState.invalid}>
					<FieldLabel className="leading-none" htmlFor={id}>
						{label}
					</FieldLabel>

					<Select
						name={field.name}
						onValueChange={field.onChange}
						value={field.value}
					>
						<SelectTrigger id={id}>
							<SelectValue placeholder={placeholder} />
						</SelectTrigger>
						<SelectContent>
							{items.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{fieldState.error && <FieldError errors={[fieldState.error]} />}
				</Field>
			)}
		/>
	);
};

export default ControlledSelect;
