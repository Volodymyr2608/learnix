import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";

const CurriculumForm = () => {
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
		<Card>
			<CardHeader>
				<CardTitle>Course Curriculum</CardTitle>
				<CardDescription>
					Organize your course content into sections and lessons
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
													placeholder={`Lesson ${lessonIndex + 1} title`}
												/>
												<Input placeholder="Duration (e.g., 15:30)" />
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
	);
};

export default CurriculumForm;
