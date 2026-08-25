import fs from "node:fs";
import path from "node:path";
import { del, put } from "@vercel/blob";
import mime from "mime";
import { logger } from "@/server/utils/logger";

export default class VercelService {
	private generateFileName(fileExt?: string) {
		return `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
	}

	async uploadFileToVercelStorage(file: File) {
		try {
			const fileExt = file.name.split(".").pop();
			const fileName = this.generateFileName(fileExt);

			const blob = await put(fileName, file, {
				access: "public",
			});

			return {
				url: blob.url,
			};
		} catch (error) {
			logger.error("Vercel upload blob", error);
			return {
				url: null,
			};
		}
	}

	async deleteFileFromVercelStorage(url: string) {
		try {
			await del(url);
			return { success: true };
		} catch (error) {
			logger.error("Vercel delete blob", error);
			return { success: false };
		}
	}

	async uploadLocalFile(filePath: string, directory: string) {
		try {
			const buffer = fs.readFileSync(filePath);
			const fileExt = path.extname(filePath).slice(1);
			const mimeType = mime.getType(filePath) || "application/octet-stream";

			const fileName = `${directory}${this.generateFileName(fileExt)}`;

			const blob = await put(fileName, new Blob([buffer], { type: mimeType }), {
				access: "public",
			});

			return {
				url: blob.url,
			};
		} catch (error) {
			logger.error("S3 Upload Error:", error);
			throw new Error("Failed to upload file to S3");
		}
	}
}

export const vercelService = new VercelService();
