import { type DocumentProps, renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { CertificateDocument } from "@/app/_components/Certificate";
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
}

export const certificateService = new CertificateService();
