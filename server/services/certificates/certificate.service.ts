import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { CertificateDocument } from "@/app/_components/Certificate";
import type { EarnedCertificate } from "@/server/entities/certificate/certificate";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import {
	CertificateNotCompleteError,
	CertificateNotFoundError,
} from "./certificate.errors";

class CertificateService {
	async renderPdf(enrollmentId: string): Promise<Buffer> {
		const enr = await enrollmentRepository.findByIdWithRelations(enrollmentId);
		if (!enr) throw new CertificateNotFoundError();
		if (!enr.completedAt) throw new CertificateNotCompleteError();

		const element = createElement(CertificateDocument, {
			studentName: enr.student.name,
			courseTitle: enr.course.title,
			instructorName: enr.course.instructor.name,
			completedAt: enr.completedAt,
			enrollmentId: enr.id,
		});

		return renderToBuffer(element as ReactElement<DocumentProps>);
	}

	async listEarned(studentId: string): Promise<EarnedCertificate[]> {
		const rows = await enrollmentRepository.findCompletedByStudent(studentId);
		return rows.flatMap((row) =>
			row.completedAt
				? [
						{
							enrollmentId: row.id,
							courseId: row.courseId,
							courseTitle: row.course.title,
							instructorName: row.course.instructor.name,
							completedAt: row.completedAt,
						},
					]
				: [],
		);
	}
}

export const certificateService = new CertificateService();
