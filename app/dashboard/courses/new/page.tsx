"use client";

import {
	ArrowLeft,
	Eye,
	GripVertical,
	Plus,
	Save,
	Trash2,
	Upload,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";
import { Label } from "@/app/_components/_shared/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import DASHBOARD_URLS from "@/lib/constants/urls/dashboardUrls";

export default function InstructorNewCoursePage() {
	const [sections, setSections] = useState([
		{
			id: 1,
			title: "",
			lessons: [{ id: 1, title: "", duration: "", videoUrl: "" }],
		},
	]);

	const addSection = () => {
		setSections([
			...sections,
			{
				id: Date.now(),
				title: "",
				lessons: [{ id: Date.now(), title: "", duration: "", videoUrl: "" }],
			},
		]);
	};

	const addLesson = (sectionId: number) => {
		setSections(
			sections.map((section) =>
				section.id === sectionId
					? {
							...section,
							lessons: [
								...section.lessons,
								{ id: Date.now(), title: "", duration: "", videoUrl: "" },
							],
						}
					: section,
			),
		);
	};

	const removeSection = (sectionId: number) => {
		setSections(sections.filter((section) => section.id !== sectionId));
	};

	const removeLesson = (sectionId: number, lessonId: number) => {
		setSections(
			sections.map((section) =>
				section.id === sectionId
					? {
							...section,
							lessons: section.lessons.filter(
								(lesson) => lesson.id !== lessonId,
							),
						}
					: section,
			),
		);
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link href={DASHBOARD_URLS.courses}>
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

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Main Content */}
				<div className="space-y-6 lg:col-span-2">
					{/* Basic Information */}
					<Card>
						<CardHeader>
							<CardTitle>Basic Information</CardTitle>
							<CardDescription>
								Enter the basic details of your course
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="title">Course Title *</Label>
								<Input
									id="title"
									placeholder="e.g., Complete Web Development Bootcamp"
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="subtitle">Subtitle</Label>
								<Input
									id="subtitle"
									placeholder="A brief description of what students will learn"
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="description">Description *</Label>
								<Textarea
									id="description"
									placeholder="Provide a detailed description of your course..."
									rows={6}
								/>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="category">Category *</Label>
									<Select>
										<SelectTrigger id="category">
											<SelectValue placeholder="Select category" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="development">Development</SelectItem>
											<SelectItem value="design">Design</SelectItem>
											<SelectItem value="business">Business</SelectItem>
											<SelectItem value="marketing">Marketing</SelectItem>
											<SelectItem value="data-science">Data Science</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="level">Level *</Label>
									<Select>
										<SelectTrigger id="level">
											<SelectValue placeholder="Select level" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="beginner">Beginner</SelectItem>
											<SelectItem value="intermediate">Intermediate</SelectItem>
											<SelectItem value="advanced">Advanced</SelectItem>
											<SelectItem value="all">All Levels</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="language">Language *</Label>
									<Select>
										<SelectTrigger id="language">
											<SelectValue placeholder="Select language" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="english">English</SelectItem>
											<SelectItem value="spanish">Spanish</SelectItem>
											<SelectItem value="french">French</SelectItem>
											<SelectItem value="german">German</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="duration">Total Duration (hours) *</Label>
									<Input id="duration" placeholder="e.g., 52" type="number" />
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Course Media */}
					<Card>
						<CardHeader>
							<CardTitle>Course Media</CardTitle>
							<CardDescription>
								Upload course thumbnail and preview video
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label>Course Thumbnail *</Label>
								<div className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary">
									<Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
									<p className="text-muted-foreground text-sm">
										Click to upload or drag and drop
									</p>
									<p className="mt-1 text-muted-foreground text-xs">
										PNG, JPG up to 2MB (1280x720 recommended)
									</p>
								</div>
							</div>

							<div className="space-y-2">
								<Label>Preview Video</Label>
								<div className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary">
									<Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
									<p className="text-muted-foreground text-sm">
										Click to upload or drag and drop
									</p>
									<p className="mt-1 text-muted-foreground text-xs">
										MP4, MOV up to 100MB
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Learning Objectives */}
					<Card>
						<CardHeader>
							<CardTitle>What Students Will Learn</CardTitle>
							<CardDescription>
								Add learning objectives (at least 4)
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{[1, 2, 3, 4].map((i) => (
								<div className="flex gap-2" key={i}>
									<Input placeholder={`Learning objective ${i}`} />
									<Button size="icon" variant="ghost">
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							))}
							<Button className="w-full bg-transparent" variant="outline">
								<Plus className="mr-2 h-4 w-4" />
								Add Learning Objective
							</Button>
						</CardContent>
					</Card>

					{/* Requirements */}
					<Card>
						<CardHeader>
							<CardTitle>Requirements</CardTitle>
							<CardDescription>
								What students need before taking this course
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{[1, 2].map((i) => (
								<div className="flex gap-2" key={i}>
									<Input placeholder={`Requirement ${i}`} />
									<Button size="icon" variant="ghost">
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							))}
							<Button className="w-full bg-transparent" variant="outline">
								<Plus className="mr-2 h-4 w-4" />
								Add Requirement
							</Button>
						</CardContent>
					</Card>

					{/* Curriculum */}
					<Card>
						<CardHeader>
							<CardTitle>Course Curriculum</CardTitle>
							<CardDescription>
								Organize your course content into sections and lessons
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{sections.map((section, sectionIndex) => (
								<div
									className="space-y-4 rounded-lg border p-4"
									key={section.id}
								>
									<div className="flex items-start gap-2">
										<GripVertical className="mt-2 h-5 w-5 cursor-move text-muted-foreground" />
										<div className="flex-1 space-y-4">
											<div className="flex gap-2">
												<Input
													onChange={(e) =>
														setSections(
															sections.map((s) =>
																s.id === section.id
																	? { ...s, title: e.target.value }
																	: s,
															),
														)
													}
													placeholder={`Section ${sectionIndex + 1}: Section Title`}
													value={section.title}
												/>
												<Button
													onClick={() => removeSection(section.id)}
													size="icon"
													variant="ghost"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>

											<div className="ml-4 space-y-2">
												{section.lessons.map((lesson, lessonIndex) => (
													<div className="flex gap-2" key={lesson.id}>
														<div className="grid flex-1 gap-2 md:grid-cols-3">
															<Input
																className="md:col-span-2"
																placeholder={`Lesson ${lessonIndex + 1} title`}
															/>
															<Input placeholder="Duration (e.g., 15:30)" />
														</div>
														<Button
															onClick={() =>
																removeLesson(section.id, lesson.id)
															}
															size="icon"
															variant="ghost"
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												))}
												<Button
													className="w-full bg-transparent"
													onClick={() => addLesson(section.id)}
													size="sm"
													variant="outline"
												>
													<Plus className="mr-2 h-4 w-4" />
													Add Lesson
												</Button>
											</div>
										</div>
									</div>
								</div>
							))}
							<Button
								className="w-full bg-transparent"
								onClick={addSection}
								variant="outline"
							>
								<Plus className="mr-2 h-4 w-4" />
								Add Section
							</Button>
						</CardContent>
					</Card>
				</div>

				{/* Sidebar */}
				<div className="space-y-6">
					{/* Pricing */}
					<Card>
						<CardHeader>
							<CardTitle>Pricing</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="price">Price (USD) *</Label>
								<Input id="price" placeholder="89.99" type="number" />
							</div>

							<div className="space-y-2">
								<Label htmlFor="original-price">
									Original Price (Optional)
								</Label>
								<Input id="original-price" placeholder="199.99" type="number" />
								<p className="text-muted-foreground text-xs">
									Show a discount by setting an original price
								</p>
							</div>
						</CardContent>
					</Card>

					{/* Status */}
					<Card>
						<CardHeader>
							<CardTitle>Course Status</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<span className="text-sm">Current Status</span>
								<Badge variant="secondary">Draft</Badge>
							</div>
							<p className="text-muted-foreground text-xs">
								Course will be saved as draft until you publish it
							</p>
						</CardContent>
					</Card>

					{/* Tips */}
					<Card>
						<CardHeader>
							<CardTitle>Tips for Success</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2 text-muted-foreground text-sm">
							<p>• Use clear, descriptive titles</p>
							<p>• Add high-quality thumbnails</p>
							<p>• Structure content logically</p>
							<p>• Include practice exercises</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
