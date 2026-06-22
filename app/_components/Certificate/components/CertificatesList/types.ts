export type CertificateListItem = {
	enrollmentId: string;
	courseTitle: string;
	instructorName: string;
	completedAt: Date;
	downloadUrl: string;
};

export type CertificatesListProps = {
	items: CertificateListItem[];
};

export type CertificateCardProps = {
	item: CertificateListItem;
};
