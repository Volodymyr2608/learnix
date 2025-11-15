"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eye, Save } from "lucide-react";
import Link from "next/link";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@/app/_components/_shared/ui/button";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { signInSchema } from "@/server/entities/user";

const CreateCourse = () => {
	const methods = useForm({
		resolver: zodResolver(signInSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	return (
		<FormProvider {...methods}>
			<form>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Link href={INSTRUCTOR_URLS.courses}>
							<Button size="icon" variant="ghost">
								<ArrowLeft className="h-4 w-4" />
							</Button>
						</Link>
						<div>
							<h1 className="font-bold text-3xl tracking-tight">
								Create New Course
							</h1>
							<p className="text-muted-foreground">
								Fill in the details to create your course
							</p>
						</div>
					</div>
					<div className="flex gap-2">
						<Button variant="outline">
							<Eye className="mr-2 h-4 w-4" />
							Preview
						</Button>
						<Button variant="outline">Save as Draft</Button>
						<Button>
							<Save className="mr-2 h-4 w-4" />
							Publish Course
						</Button>
					</div>
				</div>
			</form>
		</FormProvider>
	);
};

export default CreateCourse;
