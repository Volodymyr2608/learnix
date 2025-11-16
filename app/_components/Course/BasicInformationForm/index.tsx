"use client";

import { useFormContext } from "react-hook-form";
import ControlledSelect from "@/app/_components/_shared/Form/ControlledSelect";
import ControlledTextarea from "@/app/_components/_shared/Form/ControlledTextarea";
import FormField from "@/app/_components/_shared/Form/FormField";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";

const BasicInformationForm = () => {
	const {
		register,
		control,
		formState: { errors },
	} = useFormContext();
	console.log(errors);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Basic Information</CardTitle>
				<CardDescription>
					Enter the basic details of your course
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<FormField
					{...register("title")}
					error={errors.title?.message}
					label="Course Title *"
					placeholder="e.g., Complete Web Development Bootcamp"
				/>

				<FormField
					{...register("subtitle")}
					error={errors.subtitle?.message}
					label="Subtitle"
					placeholder="e.g., Learn HTML, CSS, JavaScript, React, Node.js and more"
				/>

				<ControlledTextarea
					control={control}
					label="Description *"
					name="description"
					placeholder="Provide a detailed description of your course..."
					rows={6}
				/>

				<div className="grid gap-4 md:grid-cols-2">
					<ControlledSelect
						control={control}
						id="category"
						items={[
							{ value: "development", label: "Development" },
							{ value: "design", label: "Design" },
							{ value: "business", label: "Business" },
							{ value: "marketing", label: "Marketing" },
							{ value: "data-science", label: "Data Science" },
						]}
						label="Category *"
						name="category"
						placeholder="Select category"
					/>

					<ControlledSelect
						control={control}
						id="level"
						items={[
							{ value: "beginner", label: "Beginner" },
							{ value: "intermediate", label: "Intermediate" },
							{ value: "advanced", label: "Advanced" },
							{ value: "all", label: "All Levels" },
						]}
						label="Level *"
						name="level"
						placeholder="Select level"
					/>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<ControlledSelect
						control={control}
						id="language"
						items={[
							{ value: "english", label: "English" },
							{ value: "spanish", label: "Spanish" },
							{ value: "french", label: "French" },
							{ value: "german", label: "German" },
						]}
						label="Language *"
						name="language"
						placeholder="Select language"
					/>

					<FormField
						{...register("duration")}
						autoComplete="off"
						error={errors.duration?.message}
						label="Total Duration (hours) *"
						placeholder="e.g., 52"
						type="number"
					/>
				</div>
			</CardContent>
		</Card>
	);
};

export default BasicInformationForm;
