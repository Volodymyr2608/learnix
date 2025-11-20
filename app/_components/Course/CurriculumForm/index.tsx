import { Plus } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import SectionLessonForm from "@/app/_components/Course/CurriculumForm/SectionLessonForm";
import type { CurriculumFormProps } from "@/app/_components/Course/CurriculumForm/types";

const CurriculumForm = ({ isEdit, courseId }: CurriculumFormProps) => {
	const {
		control,
		formState: { errors },
	} = useFormContext();

	const {
		fields: sections,
		append: addSection,
		remove: removeSection,
	} = useFieldArray({
		control,
		name: "sections",
	});

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

				<Button
					className="w-full bg-transparent"
					onClick={addSection}
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
