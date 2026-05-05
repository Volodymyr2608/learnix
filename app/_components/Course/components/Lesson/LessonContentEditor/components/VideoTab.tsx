import { Upload, Video } from "lucide-react";
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
import type { LessonFormData } from "../types";

interface VideoTabProps {
	videoUrl: LessonFormData["videoUrl"];
	videoFile: LessonFormData["videoFile"];
	onUpdate: (changes: Partial<LessonFormData>) => void;
}

export function VideoTab({
	videoUrl,
	videoFile: _videoFile,
	onUpdate,
}: VideoTabProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Video Content</CardTitle>
				<CardDescription>
					Upload or link to video content for this lesson
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="videoUrl">Video URL (YouTube, Vimeo, etc.)</Label>
					<Input
						id="videoUrl"
						onChange={(e) => onUpdate({ videoUrl: e.target.value })}
						placeholder="https://youtube.com/watch?v=..."
						type="url"
						value={videoUrl}
					/>
				</div>

				<div className="relative">
					<div className="absolute inset-0 flex items-center">
						<span className="w-full border-t" />
					</div>
					<div className="relative flex justify-center text-xs uppercase">
						<span className="bg-background px-2 text-muted-foreground">
							Or upload file
						</span>
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="videoFile">Upload Video File</Label>
					<div className="flex items-center gap-2">
						<Input
							accept="video/*"
							id="videoFile"
							onChange={(e) =>
								onUpdate({ videoFile: e.target.files?.[0] ?? null })
							}
							type="file"
						/>
						<Button size="icon" variant="outline">
							<Upload className="h-4 w-4" />
						</Button>
					</div>
					<p className="text-muted-foreground text-sm">
						Supported formats: MP4, MOV, AVI (Max: 2GB)
					</p>
				</div>

				{videoUrl && (
					<div className="rounded-lg border p-4">
						<p className="mb-2 font-medium text-sm">Video Preview</p>
						<div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
							<Video className="h-12 w-12 text-muted-foreground" />
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
