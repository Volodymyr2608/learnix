import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/trpc/client";

const useNotificationsToggle = (initialEnabled: boolean) => {
	const [enabled, setEnabled] = useState(initialEnabled);

	const updatePreferences = api.user.updateEmailPreferences.useMutation({
		onSuccess: (_, { emailNotificationsEnabled }) => {
			setEnabled(emailNotificationsEnabled);
			toast.success(
				emailNotificationsEnabled
					? "Email notifications enabled."
					: "Email notifications disabled.",
			);
		},
		onError: () => toast.error("Failed to update notification preference."),
	});

	const toggle = () =>
		updatePreferences.mutate({ emailNotificationsEnabled: !enabled });

	return { enabled, toggle, isPending: updatePreferences.isPending };
};

export default useNotificationsToggle;
