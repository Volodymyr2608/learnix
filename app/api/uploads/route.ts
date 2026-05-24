import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/better-auth/server";
import VercelService from "@/server/services/versel/vercel.service";

const ALLOWED_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"video/mp4",
	"video/webm",
	"video/quicktime",
]);

export async function POST(req: NextRequest) {
	const session = await getSession();
	const role = session?.user?.role as string | undefined;
	if (!session?.user || (role !== "INSTRUCTOR" && role !== "ADMIN")) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	try {
		const formData = await req.formData();
		const file = formData.get("file") as File | null;

		if (!(file instanceof File) || file.size === 0) {
			return NextResponse.json(
				{ error: "Invalid or missing file." },
				{ status: 400 },
			);
		}

		if (!ALLOWED_MIME_TYPES.has(file.type)) {
			return NextResponse.json(
				{ error: "Unsupported file type." },
				{ status: 415 },
			);
		}

		const vercelService = new VercelService();
		const res = await vercelService.uploadFileToVercelStorage(file);

		return NextResponse.json({ mediaUrl: res.url });
	} catch (error) {
		console.error("Upload file error:", error);
		return NextResponse.json({ error: "Upload failed." }, { status: 500 });
	}
}
