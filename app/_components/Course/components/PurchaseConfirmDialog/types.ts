export type PurchaseCourse = {
	id: string;
	title: string;
	instructor: string;
	thumbnail: string | null;
	priceCents: number;
};

export type PurchaseConfirmDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	course: PurchaseCourse;
};
