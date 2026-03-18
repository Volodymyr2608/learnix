"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import ControlledSelect from "@/app/_components/_shared/components/Form/ControlledSelect";
import ControlledTextarea from "@/app/_components/_shared/components/Form/ControlledTextarea";
import FormField from "@/app/_components/_shared/components/Form/FormField";
import { Button } from "@/app/_components/_shared/ui/button";

const instructorApplicationSchema = z.object({
	fullName: z.string().min(2, "Full name must be at least 2 characters"),
	email: z.string().email("Invalid email address"),
	phone: z.string().min(10, "Phone number must be at least 10 digits"),
	expertise: z.string().min(1, "Please select your area of expertise"),
	experience: z.string().min(1, "Please select your teaching experience"),
	bio: z.string().min(50, "Bio must be at least 50 characters"),
	courseIdea: z
		.string()
		.min(20, "Please describe your course idea (at least 20 characters)"),
	linkedIn: z.string().url("Invalid URL").optional().or(z.literal("")),
	website: z.string().url("Invalid URL").optional().or(z.literal("")),
});

type InstructorApplicationFormData = z.infer<
	typeof instructorApplicationSchema
>;

const InstructorApplicationForm = () => {
	const [isLoading, setIsLoading] = useState(false);
	const [isSubmitted, setIsSubmitted] = useState(false);
	const router = useRouter();

	const {
		register,
		control,
		handleSubmit,
		formState: { errors },
	} = useForm({
		resolver: zodResolver(instructorApplicationSchema),
		defaultValues: {
			fullName: "",
			email: "",
			phone: "",
			expertise: "",
			experience: "",
			bio: "",
			courseIdea: "",
			linkedIn: "",
			website: "",
		},
	});

	async function onSubmit(data: InstructorApplicationFormData) {
		setIsLoading(true);
		// Simulate API call
		await new Promise((resolve) => setTimeout(resolve, 2000));
		console.log("[v0] Instructor application submitted:", data);
		setIsLoading(false);
		setIsSubmitted(true);

		// Redirect to success page after 2 seconds
		setTimeout(() => {
			router.push("/instructors/success");
		}, 2000);
	}

	if (isSubmitted) {
		return (
			<div className="flex flex-col items-center justify-center gap-4 rounded-lg bg-background p-12 text-center shadow-sm">
				<CheckCircle2 className="h-16 w-16 text-green-500" />
				<h3 className="font-bold text-2xl">Application Submitted!</h3>
				<p className="text-muted-foreground">
					Thank you for applying. We'll review your application and get back to
					you within 2-3 business days.
				</p>
			</div>
		);
	}

	return (
		<form
			className="space-y-6 rounded-lg bg-background p-8 shadow-sm"
			onSubmit={handleSubmit(onSubmit)}
		>
			{/* Personal Information */}
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
							typeof errors.email?.message === "string"
								? errors.email?.message
								: undefined
						}
						label="Phone number"
						placeholder="+1 (555) 000-0000"
						type="tel"
					/>
				</div>
			</div>

			{/* Professional Background */}
			<div className="space-y-4">
				<h3 className="font-semibold text-lg">Professional Background</h3>

				<div className="grid gap-4 sm:grid-cols-2">
					<ControlledSelect
						control={control as any}
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
						control={control as any}
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
					control={control as any}
					label="Professional Bio *"
					name="bio"
					placeholder="Tell us about your background, expertise, and why you want to teach..."
					textareaProps={{
						className: "min-h-32 resize-none",
					}}
				/>
			</div>

			{/* Course Information */}
			<div className="space-y-4">
				<h3 className="font-semibold text-lg">Course Information</h3>

				<ControlledTextarea
					control={control as any}
					label="Course Idea *"
					name="courseIdea"
					placeholder="Describe the course you'd like to create, including topics you'll cover..."
					textareaProps={{
						className: "min-h-32 resize-none",
					}}
				/>
			</div>

			{/* Social Links */}
			{/*<div className="space-y-4">*/}
			{/*  <h3 className="text-lg font-semibold">Social Links (Optional)</h3>*/}

			{/*  <div className="grid gap-4 sm:grid-cols-2">*/}
			{/*    <FormField*/}
			{/*      control={form.control}*/}
			{/*      name="linkedIn"*/}
			{/*      render={({ field }) => (*/}
			{/*        <FormItem>*/}
			{/*          <FormLabel>LinkedIn Profile</FormLabel>*/}
			{/*          <Input type="url" placeholder="https://linkedin.com/in/..." {...field} />*/}
			{/*          <FormMessage />*/}
			{/*        </FormItem>*/}
			{/*      )}*/}
			{/*    />*/}

			{/*    <FormField*/}
			{/*      control={form.control}*/}
			{/*      name="website"*/}
			{/*      render={({ field }) => (*/}
			{/*        <FormItem>*/}
			{/*          <FormLabel>Personal Website</FormLabel>*/}
			{/*          <Input type="url" placeholder="https://..." {...field} />*/}
			{/*          <FormMessage />*/}
			{/*        </FormItem>*/}
			{/*      )}*/}
			{/*    />*/}
			{/*  </div>*/}
			{/*</div>*/}

			<Button className="w-full" disabled={isLoading} size="lg" type="submit">
				{isLoading ? (
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
