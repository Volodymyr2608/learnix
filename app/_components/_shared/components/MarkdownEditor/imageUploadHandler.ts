export async function imageUploadHandler(file: File): Promise<string> {
	const formData = new FormData();
	formData.append("file", file);

	const response = await fetch("/api/uploads", {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		const { error } = (await response.json().catch(() => ({}))) as {
			error?: string;
		};
		throw new Error(error ?? "Failed to upload image");
	}

	const { mediaUrl } = (await response.json()) as { mediaUrl: string };
	return mediaUrl;
}
