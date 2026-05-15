import { useState } from "react";

type UseLearningPathGenerateOptions = {
	courseId: string;
	onDone: () => unknown;
};

export const useLearningPathGenerate = ({
	courseId,
	onDone,
}: UseLearningPathGenerateOptions) => {
	const [isGenerating, setIsGenerating] = useState(false);
	const [progress, setProgress] = useState("");

	const handleGenerate = async () => {
		setIsGenerating(true);
		setProgress("Starting…");
		try {
			const res = await fetch("/api/chat/learning-path", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ courseId }),
			});

			if (res.ok && res.body) {
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				outer: while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					for (const line of decoder
						.decode(value, { stream: true })
						.split("\n")) {
						if (!line.startsWith("data: ")) continue;
						try {
							const event = JSON.parse(line.slice(6)) as {
								type: string;
								message?: string;
							};
							if (event.type === "progress" && event.message)
								setProgress(event.message);
							if (event.type === "done") break outer;
						} catch {}
					}
				}
			}

			await onDone();
		} finally {
			setIsGenerating(false);
			setProgress("");
		}
	};

	return { isGenerating, progress, handleGenerate };
};
