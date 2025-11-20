import type { EditBannerProps } from "@/app/_components/Course/components/EditBanner/types";

const EditBanner = ({ title }: EditBannerProps) => {
	if (!title) return null;

	return (
		<div className="rounded-lg bg-blue-50 p-4 text-blue-900 text-sm dark:bg-blue-950 dark:text-blue-100">
			Editing: <strong>{title}</strong>
		</div>
	);
};

export default EditBanner;
