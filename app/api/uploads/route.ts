import { type NextRequest, NextResponse } from "next/server";
import VercelService from "@/server/services/vercelService";

export async function POST(req: NextRequest) {
	try {
		const formData = await req.formData();
		const file = formData.get("file") as File | null;

		if (!(file instanceof File)) {
			return NextResponse.json(
				{ error: "Invalid or missing file." },
				{ status: 400 },
			);
		}

		const media = file && file.size > 0 ? file : undefined;

		if (!media) {
			return NextResponse.json({ error: "File is empty" }, { status: 400 });
		}

		const vercelService = new VercelService();

		const res = await vercelService.uploadFileToVercelStorage(media);

		return NextResponse.json({ mediaUrl: res.url });
	} catch (error) {
		console.error("Upload file error:", error);
		return NextResponse.json({ error: "Upload failed." }, { status: 500 });
	}
}
