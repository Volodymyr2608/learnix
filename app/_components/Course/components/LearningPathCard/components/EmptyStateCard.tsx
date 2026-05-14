"use client";

import { Button } from "app/_components/_shared/ui/button";
import { Loader2, Sparkles } from "lucide-react";

type EmptyStateCardProps = {
	onGenerate: () => void;
	isLoading: boolean;
};

export function EmptyStateCard({ onGenerate, isLoading }: EmptyStateCardProps) {
	return (
		<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-4 text-center">
			<Sparkles className="h-6 w-6 text-muted-foreground" />
			<p className="text-muted-foreground text-sm">
				Get a personalised list of next steps based on your progress.
			</p>
			<Button disabled={isLoading} onClick={onGenerate} size="sm">
				{isLoading ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<Sparkles className="mr-2 h-4 w-4" />
				)}
				Get your personalised path
			</Button>
		</div>
	);
}
