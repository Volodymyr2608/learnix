"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Switch } from "@/app/_components/_shared/ui/switch";
import useNotificationsToggle from "@/app/_components/Account/NotificationsSection/hooks/useNotificationsToggle";
import type { NotificationsSectionProps } from "@/app/_components/Account/NotificationsSection/types";

const NotificationsSection = ({
	initialEnabled,
}: NotificationsSectionProps) => {
	const { enabled, toggle, isPending } = useNotificationsToggle(initialEnabled);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Email notifications</CardTitle>
				<CardDescription>
					Lifecycle and marketing emails (enrollment confirmations, course
					updates). Critical auth emails always send regardless of this setting.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-center gap-3">
					<Switch
						checked={enabled}
						disabled={isPending}
						id="notifications-toggle"
						onCheckedChange={toggle}
					/>
					<label
						className="cursor-pointer text-sm"
						htmlFor="notifications-toggle"
					>
						{enabled ? "Notifications on" : "Notifications off"}
					</label>
				</div>
			</CardContent>
		</Card>
	);
};

export default NotificationsSection;
