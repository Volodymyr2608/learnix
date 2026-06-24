"use client";

import {
	BarChart,
	BookOpen,
	CheckCircle2,
	Clock,
	Loader2,
	PartyPopper,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/app/_components/_shared/ui/dialog";
import type { EnrollConfirmDialogProps } from "@/app/_components/Course/components/EnrollConfirmDialog/types";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import { api } from "@/trpc/client";

const EnrollConfirmDialog = ({
	open,
	onOpenChange,
	course,
}: EnrollConfirmDialogProps) => {
	const [step, setStep] = useState<"confirm" | "enrolling" | "success">(
		"confirm",
	);
	const enroll = api.course.enroll.useMutation({
		onSuccess: (data) => {
			if (data.alreadyEnrolled) {
				toast.info("You are already enrolled in this course.");
			} else {
				toast.success("Enrollment successful.");
			}

			setStep("success");
		},
		onError: (error) => {
			const message =
				error instanceof Error
					? error.message
					: "Failed to enroll in this course.";

			toast.error(message);
			setStep("confirm");
		},
	});

	const handleEnroll = async () => {
		setStep("enrolling");

		await enroll.mutateAsync(course.id);
	};

	const handleClose = () => {
		onOpenChange(false);
		setTimeout(() => setStep("confirm"), 300);
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="sm:max-w-md">
				{step === "confirm" && (
					<>
						<DialogHeader>
							<DialogTitle>Enroll in this course?</DialogTitle>
							<DialogDescription>
								You&apos;re about to enroll in this course and get full access
								to all materials.
							</DialogDescription>
						</DialogHeader>

						<div className="flex gap-4 py-4">
							<div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
								<Image
									alt={course.title}
									className="object-cover"
									fill
									src={course.thumbnail || "/placeholder.svg"}
								/>
							</div>
							<div className="flex flex-col justify-center">
								<h4 className="line-clamp-2 font-medium">{course.title}</h4>
								<p className="text-muted-foreground text-sm">
									by {course.instructor}
								</p>
							</div>
						</div>

						<div className="space-y-2 py-2">
							<div className="flex items-center gap-2 text-muted-foreground text-sm">
								<CheckCircle2 className="h-4 w-4 text-green-500" />
								<span>Full access to all course content</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground text-sm">
								<CheckCircle2 className="h-4 w-4 text-green-500" />
								<span>Certificate of completion</span>
							</div>
							<div className="flex items-center gap-2 text-muted-foreground text-sm">
								<CheckCircle2 className="h-4 w-4 text-green-500" />
								<span>Lifetime access</span>
							</div>
						</div>

						<div className="flex gap-3 pt-4">
							<Button
								className="flex-1 bg-transparent"
								onClick={handleClose}
								variant="outline"
							>
								Cancel
							</Button>
							<Button className="flex-1" onClick={handleEnroll}>
								Confirm Enrollment
							</Button>
						</div>
					</>
				)}

				{step === "enrolling" && (
					<div className="flex flex-col items-center justify-center gap-4 py-12">
						<Loader2 className="h-12 w-12 animate-spin text-primary" />
						<div className="text-center">
							<h3 className="font-semibold text-lg">Enrolling you now...</h3>
							<p className="text-muted-foreground text-sm">
								Setting up your course access
							</p>
						</div>
					</div>
				)}

				{step === "success" && (
					<div className="flex flex-col items-center justify-center gap-6 py-8">
						<div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
							<PartyPopper className="h-8 w-8 text-green-600" />
						</div>

						<div className="space-y-2 text-center">
							<h3 className="font-semibold text-xl">You&apos;re Enrolled!</h3>
							<p className="text-muted-foreground">
								Welcome to{" "}
								<span className="font-medium text-foreground">
									{course.title}
								</span>
							</p>
						</div>

						<div className="grid w-full grid-cols-3 gap-4 px-2 py-4">
							<div className="flex flex-col items-center gap-1 text-center">
								<BookOpen className="h-5 w-5 text-muted-foreground" />
								<span className="text-muted-foreground text-xs">
									Full Access
								</span>
							</div>
							<div className="flex flex-col items-center gap-1 text-center">
								<Clock className="h-5 w-5 text-muted-foreground" />
								<span className="text-muted-foreground text-xs">
									{course.duration || "Self-paced"}
								</span>
							</div>
							<div className="flex flex-col items-center gap-1 text-center">
								<BarChart className="h-5 w-5 text-muted-foreground" />
								<span className="text-muted-foreground text-xs">
									{course.level || "All Levels"}
								</span>
							</div>
						</div>

						<div className="flex w-full flex-col gap-2">
							<Button asChild>
								<Link href={STUDENT_URLS.learnCourse(course.id)}>
									Start Learning Now
								</Link>
							</Button>
							<Button
								className="bg-transparent"
								onClick={handleClose}
								variant="outline"
							>
								Browse More Courses
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};

export default EnrollConfirmDialog;
