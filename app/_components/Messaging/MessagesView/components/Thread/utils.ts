import { format, isToday, isYesterday } from "date-fns";

export const dateSeparatorLabel = (date: Date): string => {
	if (isToday(date)) return "Today";
	if (isYesterday(date)) return "Yesterday";
	return format(date, "MMMM d, yyyy");
};
