import { BookOpen } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import type { PreviewHeaderProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewHeader/types";

const PreviewHeader = ({ onApply, canApply }: PreviewHeaderProps) => {
	return (
		<div className="border-b bg-background p-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<BookOpen className="h-5 w-5 text-primary" />
					<h3 className="font-semibold">Course Preview</h3>
				</div>
				{canApply && (
					<Button onClick={onApply} size="sm">
						Apply to Form
					</Button>
				)}
			</div>
		</div>
	);
};

export default PreviewHeader;
