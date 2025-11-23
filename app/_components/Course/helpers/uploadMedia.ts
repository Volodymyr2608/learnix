import { toast } from "sonner";

const uploadMedia = async (file: File): Promise<string | null> => {
	try {
		const formData = new FormData();
		formData.append("file", file);

		const res = await fetch("/api/uploads", {
			method: "POST",
			body: formData,
		});

		if (!res.ok) {
			toast.error("File upload failed");
			return null;
		}

		const data = await res.json();
		return data.mediaUrl ?? null;
	} catch (e) {
		console.error(e);
		toast.error("Media upload error");
		return null;
	}
};

export default uploadMedia;
