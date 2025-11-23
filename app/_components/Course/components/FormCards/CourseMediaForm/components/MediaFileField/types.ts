export type MediaFileFieldProps = {
	name: string;
	label: string;
	fileUrl: string | null;
	accept: string;
	uploadTitle: string;
	uploadTitleDragging: string;
	uploadDescription: string;
	buttonLabel: string;
	typeMedia: PreviewType;
};

export type PreviewType = "image" | "video" | null;
