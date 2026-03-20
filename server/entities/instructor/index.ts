import { z } from "zod";
import { emailSchema, nameSchema } from "@/server/entities/base";

export const instructorSchema = z.object({
	fullName: nameSchema,
	email: emailSchema,
	phone: z.string().min(10, "Phone number must be at least 10 digits"),
	expertise: z.string().min(1, "Please select your area of expertise"),
	experience: z.string().min(1, "Please select your teaching experience"),
	bio: z.string().min(50, "Bio must be at least 50 characters"),
	courseIdea: z
		.string()
		.min(20, "Please describe your course idea (at least 20 characters)"),
	linkedIn: z.url("Invalid URL").optional().or(z.literal("")),
	website: z.url("Invalid URL").optional().or(z.literal("")),
});

export type InstructorSchemaInput = z.input<typeof instructorSchema>;
