import { AlertCircle } from "lucide-react";

export const StaleBanner = () => {
	return (
		<div className="mb-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-700 text-xs dark:bg-amber-950 dark:text-amber-300">
			<AlertCircle className="h-3.5 w-3.5 shrink-0" />
			<span>Your path may be outdated — regenerate to update.</span>
		</div>
	);
};
