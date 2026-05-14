"use client";

import { Button } from "app/_components/_shared/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";

type RegenerateButtonProps = {
	courseId: string;
	onDone: () => void;
};

export function RegenerateButton({ courseId, onDone }: RegenerateButtonProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [progress, setProgress] = useState("");

	const handleRegenerate = useCallback(async () => {
		setIsLoading(true);
		setProgress("Starting…");

		try {
			const res = await fetch("/api/chat/learning-path", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ courseId }),
			});

			if (!res.ok || !res.body) {
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				for (const line of chunk.split("\n")) {
					if (!line.startsWith("data: ")) continue;
					try {
						const data = JSON.parse(line.slice(6)) as {
							type: string;
							message?: string;
						};
						if (data.type === "progress" && data.message) {
							setProgress(data.message);
						}
						if (data.type === "done") {
							onDone();
							return;
						}
					} catch {}
				}
			}
		} finally {
			setIsLoading(false);
			setProgress("");
		}
	}, [courseId, onDone]);

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
}
