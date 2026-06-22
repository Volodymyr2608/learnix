import { Video } from "lucide-react";
import Image from "next/image";
import { Card } from "@/app/_components/_shared/ui/card";
import type { PreviewMediaProps } from "./types";

export function PreviewMedia({
	previewVideoUrl,
	thumbnailUrl,
	title,
}: PreviewMediaProps) {
	if (previewVideoUrl) {
		return (
			<Card className="aspect-video overflow-hidden">
				{/* biome-ignore lint/a11y/useMediaCaption: no caption source exists for instructor preview uploads */}
				<video
					className="h-full w-full bg-black"
					controls
					src={previewVideoUrl}
				/>
			</Card>
		);
	}

	if (thumbnailUrl) {
		return (
			<Card className="aspect-video overflow-hidden">
				<div className="relative aspect-video w-full overflow-hidden bg-muted">
					<Image alt={title} className="object-cover" fill src={thumbnailUrl} />
				</div>
			</Card>
		);
	}

	return (
		<Card className="flex aspect-video items-center justify-center overflow-hidden bg-muted">
			<div className="text-center text-muted-foreground">
				<Video className="mx-auto h-16 w-16" />
				<p className="mt-2 text-sm">No preview media yet</p>
			</div>
		</Card>
	);
}
