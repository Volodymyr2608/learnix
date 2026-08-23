import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import { api } from "@/trpc/server";

const getUnreadMessagesCount = async (): Promise<number> => {
	return safeRequest(
		"messages.getUnreadMessagesCount",
		async () => {
			return (await api.message.getUnreadCount()) ?? 0;
		},
		0,
	);
};

export default getUnreadMessagesCount;
