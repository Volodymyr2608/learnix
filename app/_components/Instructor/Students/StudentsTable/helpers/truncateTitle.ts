import { MAX_TITLE_LENGTH } from "../constants/courseDisplay";

export function truncateTitle(title: string): string {
	return title.length > MAX_TITLE_LENGTH
		? `${title.substring(0, MAX_TITLE_LENGTH)}...`
		: title;
}
