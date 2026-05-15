import { useCallback, useState } from "react";

type UseRegenerateButtonOptions = {
	courseId: string;
	onDone: () => void;
};

export const useRegenerateButton = ({
	courseId,
	onDone,
}: UseRegenerateButtonOptions) => {
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

			if (!res.ok || !res.body) return;

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
						if (data.type === "progress" && data.message)
							setProgress(data.message);
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

	return { isLoading, progress, handleRegenerate };
};
