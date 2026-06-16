import { formatDistanceToNow } from "date-fns";

/** Human relative timestamp, e.g. "2 hours ago". */
const relativeTimeLabel = (date: Date): string =>
	formatDistanceToNow(date, { addSuffix: true });

export default relativeTimeLabel;
