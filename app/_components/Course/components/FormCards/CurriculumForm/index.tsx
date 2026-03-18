import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import useDragAndDrop from "@/app/_components/_shared/hooks/useDragAndDrop";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import SectionLessonForm from "@/app/_components/Course/components/FormCards/CurriculumForm/components/SectionLessonForm";
import useReorderSections from "@/app/_components/Course/components/FormCards/CurriculumForm/hooks/useReorderSections";
import type { CurriculumFormProps } from "@/app/_components/Course/components/FormCards/CurriculumForm/types";
import type { CourseWithRelations } from "@/prisma/zod";

const CurriculumForm = ({ isEdit, courseId }: CurriculumFormProps) => {
	const {
		control,
		getValues,
		formState: { errors },
	} = useFormContext();

	const { sensors } = useDragAndDrop();

	const {
		fields: sections,
		append: addSection,
		remove: removeSection,
	} = useFieldArray({
		control,
		name: "sections",
	});

	const { handleQuestionDragEnd } = useReorderSections();

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (active.id !== over?.id) {
			handleQuestionDragEnd({
				activeId: active.id,
				overId: over?.id,
				sections,
			});
		}
	};

	const handleAddSection = () => {
		const current =
			(getValues("sections") as CourseWithRelations["sections"]) || [];

		addSection({
			title: "",
			order: current.length + 1,
			lessons: [{ title: "", duration: "" }],
		});
	};

	console.log(sections);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Course Curriculum</CardTitle>
				<CardDescription>
					{isEdit
						? "Update your course content structure"
						: "Organize your course content into sections and lessons"}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<DndContext
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
					sensors={sensors}
				>
					<SortableContext
						items={sections.map((q) => q.id)}
						strategy={verticalListSortingStrategy}
					>
						{sections.map((section, index) => (
							<SectionLessonForm
								courseId={courseId}
								isEdit={isEdit}
								key={section.id}
								removeSection={removeSection}
								sectionId={section.id}
								sectionIndex={index}
							/>
						))}
					</SortableContext>
				</DndContext>

				<Button
					className="w-full bg-transparent"
					onClick={handleAddSection}
					type="button"
					variant="outline"
				>
					<Plus className="mr-2 h-4 w-4" />
					Add Section
				</Button>

				{typeof errors.sections?.message === "string" && (
					<p className="text-red-500 text-sm">{errors.sections.message}</p>
				)}
			</CardContent>
		</Card>
	);
};

export default CurriculumForm;
