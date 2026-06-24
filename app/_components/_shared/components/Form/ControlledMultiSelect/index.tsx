"use client";

import type { FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";
import { Badge } from "@/app/_components/_shared/ui/badge";
import {
	Field,
	FieldError,
	FieldLegend,
} from "@/app/_components/_shared/ui/field";
import type { ControlledMultiSelectProps } from "./types";

const ControlledMultiSelect = <T extends FieldValues>({
	control,
	name,
	label,
	items,
}: ControlledMultiSelectProps<T>) => {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => {
				const selected: string[] = field.value ?? [];

				const toggle = (value: string) => {
					field.onChange(
						selected.includes(value)
							? selected.filter((v) => v !== value)
							: [...selected, value],
					);
				};

				return (
					<Field className="gap-2" data-invalid={fieldState.invalid}>
						<FieldLegend className="leading-none" variant="label">
							{label}
						</FieldLegend>
						<div className="flex flex-wrap gap-2">
							{items.map((item) => (
								<Badge asChild key={item.value} variant="outline">
									<button
										aria-pressed={selected.includes(item.value)}
										className={
											selected.includes(item.value)
												? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
												: undefined
										}
										onClick={() => toggle(item.value)}
										type="button"
									>
										{item.label}
									</button>
								</Badge>
							))}
						</div>
						{fieldState.error && <FieldError errors={[fieldState.error]} />}
					</Field>
				);
			}}
		/>
	);
};

export default ControlledMultiSelect;
