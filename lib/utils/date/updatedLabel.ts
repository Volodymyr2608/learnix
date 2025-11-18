import { formatDistanceToNow } from "date-fns";

const updatedLabel = (date: Date) => {
	return `Updated ${formatDistanceToNow(date, { addSuffix: true })}`;
};

export default updatedLabel;
