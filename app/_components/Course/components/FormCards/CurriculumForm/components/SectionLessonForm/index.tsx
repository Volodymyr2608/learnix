import { Edit, Eye, GripVertical, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import FormField from "@/app/_components/_shared/components/Form/FormField";
import useSortableItem from "@/app/_components/_shared/hooks/useSortableItem";
import { Button } from "@/app/_components/_shared/ui/button";
import type { SectionLessonFormProps } from "@/app/_components/Course/components/FormCards/CurriculumForm/components/SectionLessonForm/types";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { cn } from "@/lib/utils/cn";

const SectionLessonForm = ({
	sectionIndex,
	removeSection,
	isEdit,
	courseId,
	sectionId,
}: SectionLessonFormProps) => {
	const { dragHandleProps, setNodeRef, style, isDragging } = useSortableItem({
		id: sectionId,
	});

	const {
		control,
		register,
		formState: { errors },
	} = useFormContext();

	const {
		fields: lessonFields,
		append: addLesson,
		remove: removeLesson,
	} = useFieldArray({
		control,
		name: `sections.${sectionIndex}.lessons`,
	});

	const watchedLessons = useWatch({
		control,
		name: `sections.${sectionIndex}.lessons`,
	}) as { id?: string }[] | undefined;

	const sectionItem = Array.isArray(errors.sections)
		? errors.sections[sectionIndex]
		: null;

	return (
		<div
			className={cn("space-y-4 rounded-lg border p-4", {
				"opacity-50 shadow-lg": isDragging,
			})}
			ref={setNodeRef}
			style={style}
		>
			<div className="flex items-start gap-2">
				<Button
					className="h-5 w-5 cursor-grab p-0 active:cursor-grabbing"
					size="sm"
					type="button"
					variant="ghost"
					{...dragHandleProps}
				>
					<GripVertical className="mt-2 h-5 w-5 cursor-move text-muted-foreground" />
				</Button>

				<div className="flex-1 space-y-4">
					<div className="flex gap-2">
						<FormField
							{...register(`sections.${sectionIndex}.title`)}
							error={
								sectionItem && typeof sectionItem.title?.message === "string"
									? sectionItem.title?.message
									: undefined
							}
							label={null}
							placeholder={`Section ${sectionIndex + 1}: Section Title`}
						/>

						<Button
							onClick={() => removeSection(sectionIndex)}
							size="icon"
							type="button"
							variant="ghost"
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>

					<div className="ml-4 space-y-2">
						{lessonFields.map((lesson, lessonIndex) => {
							const section =
								Array.isArray(errors.sections) && errors.sections[sectionIndex];
							const lessonData =
								section &&
								Array.isArray(section.lessons) &&
								section.lessons[lessonIndex];
							const isTitleError =
								lessonData && typeof lessonData.title?.message === "string";
							const isDurationError =
								lessonData &&
								typeof lessonData.durationMinutes?.message === "string";

							const dbLessonId = watchedLessons?.[lessonIndex]?.id;

							return (
								<div className="flex gap-2" key={lesson.id}>
									<div className="grid flex-1 gap-2 md:grid-cols-3">
										<FormField
											{...register(
												`sections.${sectionIndex}.lessons.${lessonIndex}.title`,
											)}
											error={
												isTitleError ? lessonData.title?.message : undefined
											}
											fieldClassName="md:col-span-2"
											label={null}
											placeholder={`Lesson ${lessonIndex + 1} title`}
										/>
										<FormField
											{...register(
												`sections.${sectionIndex}.lessons.${lessonIndex}.durationMinutes`,
												{ valueAsNumber: true },
											)}
											error={
												isDurationError
													? lessonData.durationMinutes?.message
													: undefined
											}
											label={null}
											placeholder="Minutes (e.g., 15)"
											type="number"
										/>
									</div>
									{isEdit && courseId && dbLessonId && (
										<>
											<Button
												asChild
												size="icon"
												title="Preview lesson as student"
												variant="outline"
											>
												<Link
													href={INSTRUCTOR_URLS.previewLesson(
														courseId,
														dbLessonId,
													)}
												>
													<Eye className="h-4 w-4" />
												</Link>
											</Button>
											<Button
												asChild
												size="icon"
												title="Edit lesson content (video, text, resources, quiz)"
												variant="outline"
											>
												<Link
													href={INSTRUCTOR_URLS.editLesson(
														courseId,
														dbLessonId,
													)}
												>
													<Edit className="h-4 w-4" />
												</Link>
											</Button>
										</>
									)}
									<Button
										onClick={() => removeLesson(lessonIndex)}
										size="icon"
										type="button"
										variant="ghost"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							);
						})}

						{sectionItem?.lessons?.message && (
							<p className="text-red-500 text-sm">
								{sectionItem.lessons?.message}
							</p>
						)}

						<Button
							className="w-full bg-transparent"
							onClick={() => addLesson({ title: "", durationMinutes: null })}
							size="sm"
							type="button"
							variant="outline"
						>
							<Plus className="mr-2 h-4 w-4" />
							Add Lesson
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default SectionLessonForm;
