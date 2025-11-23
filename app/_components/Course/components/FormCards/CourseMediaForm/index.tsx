"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import MediaFileField from "@/app/_components/Course/components/FormCards/CourseMediaForm/components/MediaFileField";
import type { CourseMediaFormProps } from "@/app/_components/Course/components/FormCards/CourseMediaForm/types";

const CourseMediaForm = ({
	previewVideoUrl,
	thumbnailUrl,
}: CourseMediaFormProps) => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Course Media</CardTitle>
				<CardDescription>
					Upload course thumbnail and preview video
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-6">
				<MediaFileField
					accept="image/*"
					buttonLabel="Change Thumbnail"
					fileUrl={thumbnailUrl}
					label="Course Thumbnail *"
					name="thumbnail"
					typeMedia="image"
					uploadDescription="JPG, PNG up to 5MB"
					uploadTitle="Click to upload thumbnail"
					uploadTitleDragging="Drop your thumbnail here"
				/>
				<MediaFileField
					accept="video/*"
					buttonLabel="Change preview video"
					fileUrl={previewVideoUrl}
					label="Preview Video"
					name="previewVideo"
					typeMedia="video"
					uploadDescription="MP4, MOV up to 10MB"
					uploadTitle="Click to upload video"
					uploadTitleDragging="Drop your video here"
				/>
			</CardContent>
		</Card>
	);
};

export default CourseMediaForm;
