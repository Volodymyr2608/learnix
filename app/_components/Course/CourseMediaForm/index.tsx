import { Upload } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Label } from "@/app/_components/_shared/ui/label";

const CourseMediaForm = () => {
	return (
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
	);
};

export default CourseMediaForm;
