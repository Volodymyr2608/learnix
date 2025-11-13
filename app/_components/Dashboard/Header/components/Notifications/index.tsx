import { Bell } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/_components/_shared/ui/dropdown-menu";

const Notifications = () => {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button className="relative" size="icon" variant="ghost">
					<Bell className="h-5 w-5" />
					<span className="absolute top-1 right-1 flex h-2 w-2">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
						<span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80">
				<DropdownMenuLabel>Notifications</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem>
					<div className="flex flex-col gap-1">
						<p className="font-medium text-sm">New course available</p>
						<p className="text-muted-foreground text-xs">
							Advanced React Patterns is now available
						</p>
					</div>
				</DropdownMenuItem>
				<DropdownMenuItem>
					<div className="flex flex-col gap-1">
						<p className="font-medium text-sm">Assignment due soon</p>
						<p className="text-muted-foreground text-xs">
							Complete your JavaScript project by Friday
						</p>
					</div>
				</DropdownMenuItem>
				<DropdownMenuItem>
					<div className="flex flex-col gap-1">
						<p className="font-medium text-sm">New message</p>
						<p className="text-muted-foreground text-xs">
							Your instructor replied to your question
						</p>
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default Notifications;
