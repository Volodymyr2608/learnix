"use client";

import { GripVertical, Plus, Save, Trash2, Upload } from "lucide-react";
import Image from "next/image";
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

// interface EditCourseFormProps {
// 	courseId: string;
// }

export function EditCourseForm() {
	const [sections, setSections] = useState([
		{
			id: 1,
			title: "Getting Started",
			lessons: [
				{
					id: 1,
					title: "Introduction to the Course",
					duration: "5:30",
					videoUrl: "",
				},
				{
					id: 2,
					title: "Setting Up Your Environment",
					duration: "12:45",
					videoUrl: "",
				},
			],
		},
		{
			id: 2,
			title: "Core Concepts",
			lessons: [
				{
					id: 3,
					title: "Understanding the Basics",
					duration: "18:20",
					videoUrl: "",
				},
				{
					id: 4,
					title: "Advanced Techniques",
					duration: "25:15",
					videoUrl: "",
				},
			],
		},
	]);

	const [objectives, setObjectives] = useState([
		"Build full-stack web applications from scratch",
		"Master HTML, CSS, JavaScript, and React",
		"Create RESTful APIs with Node.js and Express",
		"Deploy applications to production",
	]);

	const [requirements, setRequirements] = useState([
		"Basic computer skills",
		"No prior programming experience required",
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

	const addObjective = () => {
		setObjectives([...objectives, ""]);
	};

	const removeObjective = (index: number) => {
		setObjectives(objectives.filter((_, i) => i !== index));
	};

	const updateObjective = (index: number, value: string) => {
		setObjectives(objectives.map((obj, i) => (i === index ? value : obj)));
	};

	const addRequirement = () => {
		setRequirements([...requirements, ""]);
	};

	const removeRequirement = (index: number) => {
		setRequirements(requirements.filter((_, i) => i !== index));
	};

	const updateRequirement = (index: number, value: string) => {
		setRequirements(requirements.map((req, i) => (i === index ? value : req)));
	};

	return (
		<div className="grid gap-6 lg:grid-cols-3">
			{/* Main Content */}
			<div className="space-y-6 lg:col-span-2">
				<Card>
					<CardHeader>
						<CardTitle>Basic Information</CardTitle>
						<CardDescription>
							Update the basic details of your course
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="title">Course Title *</Label>
							<Input
								defaultValue="Complete Web Development Bootcamp"
								id="title"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="subtitle">Subtitle</Label>
							<Input
								defaultValue="Learn HTML, CSS, JavaScript, React, Node.js and more"
								id="subtitle"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Description *</Label>
							<Textarea
								defaultValue="Master web development from scratch with this comprehensive bootcamp..."
								id="description"
								rows={6}
							/>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="category">Category *</Label>
								<Select defaultValue="development">
									<SelectTrigger id="category">
										<SelectValue />
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
								<Select defaultValue="beginner">
									<SelectTrigger id="level">
										<SelectValue />
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
								<Select defaultValue="english">
									<SelectTrigger id="language">
										<SelectValue />
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
								<Input defaultValue="52" id="duration" type="number" />
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Course Media */}
				<Card>
					<CardHeader>
						<CardTitle>Course Media</CardTitle>
						<CardDescription>
							Update course thumbnail and preview video
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label>Current Thumbnail</Label>
							<div className="relative aspect-video w-full overflow-hidden rounded-lg border">
								<Image
									alt="Course thumbnail"
									className="h-full w-full object-cover"
									fill
									src="/web-development-concept.png"
								/>
							</div>
							<Button size="sm" variant="outline">
								<Upload className="mr-2 h-4 w-4" />
								Change Thumbnail
							</Button>
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

				<Card>
					<CardHeader>
						<CardTitle>What Students Will Learn</CardTitle>
						<CardDescription>Update learning objectives</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{objectives.map((objective, i) => (
							<div className="flex gap-2" key={objective}>
								<Input
									onChange={(e) => updateObjective(i, e.target.value)}
									value={objective}
								/>
								<Button
									onClick={() => removeObjective(i)}
									size="icon"
									variant="ghost"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						))}
						<Button
							className="w-full bg-transparent"
							onClick={addObjective}
							variant="outline"
						>
							<Plus className="mr-2 h-4 w-4" />
							Add Learning Objective
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Requirements</CardTitle>
						<CardDescription>
							What students need before taking this course
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{requirements.map((req, i) => (
							<div className="flex gap-2" key={req}>
								<Input
									onChange={(e) => updateRequirement(i, e.target.value)}
									value={req}
								/>
								<Button
									onClick={() => removeRequirement(i)}
									size="icon"
									variant="ghost"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						))}
						<Button
							className="w-full bg-transparent"
							onClick={addRequirement}
							variant="outline"
						>
							<Plus className="mr-2 h-4 w-4" />
							Add Requirement
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Course Curriculum</CardTitle>
						<CardDescription>
							Update your course content structure
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{sections.map((section, sectionIndex) => (
							<div className="space-y-4 rounded-lg border p-4" key={section.id}>
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
															onChange={(e) =>
																setSections(
																	sections.map((s) =>
																		s.id === section.id
																			? {
																					...s,
																					lessons: s.lessons.map((l) =>
																						l.id === lesson.id
																							? { ...l, title: e.target.value }
																							: l,
																					),
																				}
																			: s,
																	),
																)
															}
															placeholder={`Lesson ${lessonIndex + 1} title`}
															value={lesson.title}
														/>
														<Input
															onChange={(e) =>
																setSections(
																	sections.map((s) =>
																		s.id === section.id
																			? {
																					...s,
																					lessons: s.lessons.map((l) =>
																						l.id === lesson.id
																							? {
																									...l,
																									duration: e.target.value,
																								}
																							: l,
																					),
																				}
																			: s,
																	),
																)
															}
															placeholder="Duration (e.g., 15:30)"
															value={lesson.duration}
														/>
													</div>
													<Button
														onClick={() => removeLesson(section.id, lesson.id)}
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
				<Card>
					<CardHeader>
						<CardTitle>Pricing</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="price">Price (USD) *</Label>
							<Input defaultValue="89.99" id="price" type="number" />
						</div>

						<div className="space-y-2">
							<Label htmlFor="original-price">Original Price (Optional)</Label>
							<Input defaultValue="199.99" id="original-price" type="number" />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Course Status</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between">
							<span className="text-sm">Current Status</span>
							<Badge>Published</Badge>
						</div>
						<p className="text-muted-foreground text-xs">
							This course is live and visible to students
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Course Stats</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Students</span>
							<span className="font-semibold">456</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Rating</span>
							<span className="font-semibold">4.9 ⭐</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Revenue</span>
							<span className="font-semibold">$4,560</span>
						</div>
					</CardContent>
				</Card>

				<div className="flex gap-2">
					<Button className="flex-1" variant="outline">
						Save Changes
					</Button>
					<Button className="flex-1">
						<Save className="mr-2 h-4 w-4" />
						Update & Publish
					</Button>
				</div>
			</div>
		</div>
	);
}
