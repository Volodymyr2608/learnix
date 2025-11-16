import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import FormField from "@/app/_components/_shared/Form/FormField";
import { Button } from "@/app/_components/_shared/ui/button";
import type { SectionLessonFormProps } from "@/app/_components/Course/CurriculumForm/SectionLessonForm/types";

const SectionLessonForm = ({
	sectionIndex,
	removeSection,
}: SectionLessonFormProps) => {
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

	const sectionItem = Array.isArray(errors.sections)
		? errors.sections[sectionIndex]
		: null;

	return (
		<div className="space-y-4 rounded-lg border p-4">
			<div className="flex items-start gap-2">
				<GripVertical className="mt-2 h-5 w-5 cursor-move text-muted-foreground" />
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
								Array.isArray(section.lessons) && section.lessons[lessonIndex];
							const isTitleError =
								lessonData && typeof lessonData.title?.message === "string";
							const isDurationError =
								lessonData && typeof lessonData.duration?.message === "string";

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
												`sections.${sectionIndex}.lessons.${lessonIndex}.duration`,
											)}
											error={
												isDurationError
													? lessonData.duration?.message
													: undefined
											}
											label={null}
											placeholder="Duration (e.g., 15:30)"
										/>
									</div>
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
							onClick={() => addLesson({ title: "", duration: "" })}
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
