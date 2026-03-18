"use client";

import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import FormField from "@/app/_components/_shared/components/Form/FormField";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";

const LearningObjectivesForm = ({ isEdit = false }) => {
	const {
		control,
		formState: { errors },
	} = useFormContext();

	const { fields, append, remove } = useFieldArray({
		control,
		name: "objectives",
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>What Students Will Learn</CardTitle>
				<CardDescription>
					{isEdit
						? "Update learning objectives"
						: "Add learning objectives (at least 4)"}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{fields.map((objective, index) => {
					const name = `objectives.${index}.value`;

					return (
						<div className="flex gap-2" key={objective.id}>
							<Controller
								control={control}
								name={name}
								render={({ field }) => {
									const { value, ...rest } = field;

									const errorMessage = Array.isArray(errors.objectives)
										? errors.objectives?.[index]?.value.message
										: undefined;

									return (
										<FormField
											{...rest}
											error={
												typeof errorMessage === "string"
													? errorMessage
													: undefined
											}
											label={null}
											placeholder={`Learning objective ${index + 1}`}
											value={value}
										/>
									);
								}}
							/>
							<Button
								disabled={fields.length <= 4}
								onClick={() => remove(index)}
								size="icon"
								type="button"
								variant="ghost"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					);
				})}

				<Button
					className="w-full bg-transparent"
					onClick={() => append({ value: "" })}
					type="button"
					variant="outline"
				>
					<Plus className="mr-2 h-4 w-4" />
					Add Learning Objective
				</Button>
			</CardContent>
		</Card>
	);
};

export default LearningObjectivesForm;
