"use client";

import { Button } from "app/_components/_shared/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useRegenerateButton } from "./hooks/useRegenerateButton";
import type { RegenerateButtonProps } from "./types";

export const RegenerateButton = ({
	courseId,
	onDone,
}: RegenerateButtonProps) => {
	const { isLoading, progress, handleRegenerate } = useRegenerateButton({
		courseId,
		onDone,
	});

	return (
		<div className="mt-3 flex items-center gap-2">
			<Button
				disabled={isLoading}
				onClick={handleRegenerate}
				size="sm"
				variant="outline"
			>
				{isLoading ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<RefreshCw className="mr-2 h-4 w-4" />
				)}
				Regenerate
			</Button>
			{isLoading && progress && (
				<p className="text-muted-foreground text-xs">{progress}</p>
			)}
		</div>
	);
};
