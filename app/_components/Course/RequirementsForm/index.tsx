import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import FormField from "@/app/_components/_shared/Form/FormField";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";

const RequirementsForm = () => {
	const {
		control,
		formState: { errors },
	} = useFormContext();

	const { fields, append, remove } = useFieldArray({
		control,
		name: "requirements",
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Requirements</CardTitle>
				<CardDescription>
					What students need before taking this course
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{fields.map((requirement, index) => {
					const name = `requirements.${index}.value`;

					return (
						<div className="flex gap-2" key={requirement.id}>
							<Controller
								control={control}
								name={name}
								render={({ field }) => {
									const { value: requirement, ...rest } = field;
									const errorMessage = Array.isArray(errors.requirements)
										? errors.requirements?.[index]?.value.message
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
											placeholder={`Requirement ${index + 1}`}
											value={requirement.value}
										/>
									);
								}}
							/>
							<Button
								disabled={fields.length <= 2}
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
					Add Requirement
				</Button>
			</CardContent>
		</Card>
	);
};

export default RequirementsForm;
