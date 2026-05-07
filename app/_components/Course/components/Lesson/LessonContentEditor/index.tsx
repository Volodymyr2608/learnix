"use client";

import { Download, FileText, HelpCircle, Video } from "lucide-react";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/app/_components/_shared/ui/tabs";
import type { LessonContentEditorProps } from "@/app/_components/Course/components/Lesson/LessonContentEditor/types";
import { EditorActions } from "./components/EditorActions";
import { LessonInfoCard } from "./components/LessonInfoCard";
import { QuizTab } from "./components/QuizTab";
import { ResourcesTab } from "./components/ResourcesTab";
import { TextTab } from "./components/TextTab";
import { VideoTab } from "./components/VideoTab";
import { useLessonEditor } from "./hooks/useLessonEditor";

export const LessonContentEditor = ({
	courseId,
	initialLesson,
}: LessonContentEditorProps) => {
	const {
		lessonData,
		updateLessonData,
		resources,
		addResource,
		removeResource,
		updateResource,
		quizQuestions,
		addQuizQuestion,
		removeQuizQuestion,
		updateQuiz,
		updateQuizOption,
		isSaving,
		handleSave,
	} = useLessonEditor(initialLesson);

	return (
		<div className="space-y-6">
			<LessonInfoCard data={lessonData} onUpdate={updateLessonData} />

			<Tabs className="space-y-4" defaultValue="video">
				<TabsList className="grid w-full grid-cols-4">
					<TabsTrigger value="video">
						<Video className="mr-2 h-4 w-4" />
						Video
					</TabsTrigger>
					<TabsTrigger value="text">
						<FileText className="mr-2 h-4 w-4" />
						Text Content
					</TabsTrigger>
					<TabsTrigger value="resources">
						<Download className="mr-2 h-4 w-4" />
						Resources
					</TabsTrigger>
					<TabsTrigger value="quiz">
						<HelpCircle className="mr-2 h-4 w-4" />
						Quiz
					</TabsTrigger>
				</TabsList>

				<TabsContent value="video">
					<VideoTab
						onUpdate={updateLessonData}
						videoFile={lessonData.videoFile}
						videoUrl={lessonData.videoUrl}
					/>
				</TabsContent>

				<TabsContent value="text">
					<TextTab
						content={lessonData.textContent}
						onChange={(value) => updateLessonData({ textContent: value })}
					/>
				</TabsContent>

				<TabsContent value="resources">
					<ResourcesTab
						onAdd={addResource}
						onRemove={removeResource}
						onUpdate={updateResource}
						resources={resources}
					/>
				</TabsContent>

				<TabsContent value="quiz">
					<QuizTab
						lessonId={initialLesson.id}
						onAdd={addQuizQuestion}
						onRemove={removeQuizQuestion}
						onUpdate={updateQuiz}
						onUpdateOption={updateQuizOption}
						questions={quizQuestions}
					/>
				</TabsContent>
			</Tabs>

			<EditorActions
				courseId={courseId}
				isSaving={isSaving}
				lessonId={initialLesson.id}
				onSave={handleSave}
			/>
		</div>
	);
};
