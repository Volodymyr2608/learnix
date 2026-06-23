import { api } from "@/trpc/server";

const getUnreadMessagesCount = async (): Promise<number> => {
	try {
		return (await api.message.getUnreadCount()) ?? 0;
	} catch (error) {
		console.error("Error fetching unread messages count:", error);
		return 0;
	}
};

export default getUnreadMessagesCount;
