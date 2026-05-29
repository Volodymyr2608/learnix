"use client";

import { Loader2 } from "lucide-react";
import type { Control } from "react-hook-form";
import ControlledField from "@/app/_components/_shared/components/Form/ControlledField";
import ControlledSelect from "@/app/_components/_shared/components/Form/ControlledSelect";
import ControlledTextarea from "@/app/_components/_shared/components/Form/ControlledTextarea";
import FormField from "@/app/_components/_shared/components/Form/FormField";
import { Button } from "@/app/_components/_shared/ui/button";
import useCreateInstructor from "@/app/_components/Teach/ApplicationForm/components/InstructorApplicationForm/hooks/useCreateInstructor";
import useInstructorForm from "@/app/_components/Teach/ApplicationForm/components/InstructorApplicationForm/hooks/useInstructorForm";
import type { InstructorSchemaInput } from "@/server/entities/instructor";

const InstructorApplicationForm = () => {
	const {
		register,
		control,
		handleSubmit,
		formState: { errors },
	} = useInstructorForm();

	const { onSubmit, isPending } = useCreateInstructor();

	return (
		<form
			className="space-y-6 rounded-lg bg-background p-8 shadow-sm"
			onSubmit={handleSubmit(onSubmit)}
		>
			<div className="space-y-4">
				<h3 className="font-semibold text-lg">Personal Information</h3>

				<FormField
					{...register("fullName")}
					error={
						typeof errors.fullName?.message === "string"
							? errors.fullName?.message
							: undefined
					}
					label="Full Name *"
					placeholder="John Doe"
				/>

				<div className="grid gap-4 sm:grid-cols-2">
					<FormField
						{...register("email")}
						error={
							typeof errors.email?.message === "string"
								? errors.email?.message
								: undefined
						}
						label="Email *"
						placeholder="john@example.com"
					/>

					<FormField
						{...register("phone")}
						error={
							typeof errors.phone?.message === "string"
								? errors.phone?.message
								: undefined
						}
						label="Phone number"
						placeholder="+1 (555) 000-0000"
						type="tel"
					/>

					<ControlledField
						control={control as Control<InstructorSchemaInput>}
						label="Password"
						name="password"
						placeholder="••••••••"
						type="password"
					/>
					<ControlledField
						control={control as Control<InstructorSchemaInput>}
						label="Confirm Password"
						name="confirmPassword"
						placeholder="••••••••"
						type="password"
					/>
				</div>
			</div>

			<div className="space-y-4">
				<h3 className="font-semibold text-lg">Professional Background</h3>

				<div className="grid gap-4 sm:grid-cols-2">
					<ControlledSelect
						control={control as Control<InstructorSchemaInput>}
						id="expertise"
						items={[
							{ value: "web-development", label: "Web Development" },
							{ value: "mobile-development", label: "Mobile Development" },
							{ value: "data-science", label: "Data Science" },
							{ value: "design", label: "Design" },
							{ value: "business", label: "Business" },
							{ value: "marketing", label: "Marketing" },
							{ value: "other", label: "Other" },
						]}
						label="Area of Expertise *"
						name="expertise"
						placeholder="Select expertise"
					/>

					<ControlledSelect
						control={control as Control<InstructorSchemaInput>}
						id="experience"
						items={[
							{ value: "beginner", label: "Beginner (0-1 years)" },
							{ value: "intermediate", label: "Intermediate (1-3 years)" },
							{ value: "experienced", label: "Experienced (3-5 years)" },
							{ value: "expert", label: "Expert (5+ years)" },
						]}
						label="Teaching Experience *"
						name="experience"
						placeholder="Select experience"
					/>
				</div>

				<ControlledTextarea
					control={control as Control<InstructorSchemaInput>}
					label="Professional Bio *"
					name="bio"
					placeholder="Tell us about your background, expertise, and why you want to teach..."
					textareaProps={{
						className: "min-h-32 resize-none",
					}}
				/>
			</div>

			<div className="space-y-4">
				<h3 className="font-semibold text-lg">Course Information</h3>

				<ControlledTextarea
					control={control as Control<InstructorSchemaInput>}
					label="Course Idea *"
					name="courseIdea"
					placeholder="Describe the course you'd like to create, including topics you'll cover..."
					textareaProps={{
						className: "min-h-32 resize-none",
					}}
				/>
			</div>

			{/* Social Links */}
			<div className="space-y-4">
				<h3 className="font-semibold text-lg">Social Links (Optional)</h3>

				<div className="grid gap-4 sm:grid-cols-2">
					<FormField
						{...register("linkedIn")}
						error={
							typeof errors.linkedIn?.message === "string"
								? errors.linkedIn?.message
								: undefined
						}
						label="LinkedIn Profile"
						placeholder="https://linkedin.com/in/..."
						type="url"
					/>

					<FormField
						{...register("website")}
						error={
							typeof errors.website?.message === "string"
								? errors.website?.message
								: undefined
						}
						label="Personal Website"
						placeholder="https://..."
						type="url"
					/>
				</div>
			</div>

			<Button className="w-full" disabled={isPending} size="lg" type="submit">
				{isPending ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Submitting Application...
					</>
				) : (
					"Submit Application"
				)}
			</Button>
		</form>
	);
};

export default InstructorApplicationForm;
