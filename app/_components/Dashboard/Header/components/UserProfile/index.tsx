import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/_components/_shared/ui/dropdown-menu";
import LogoutButton from "@/app/_components/Dashboard/Header/components/UserProfile/components/LogoutButton";
import { capitalize } from "@/lib/utils/capitalize";
import getInitials from "@/lib/utils/user/getInitials";
import getUserName from "@/lib/utils/user/getUserName";
import requireAuth from "@/lib/utils/user/requireAuth";
import { getSession } from "@/server/better-auth/server";

const UserProfile = async () => {
	const { user } = requireAuth(await getSession());

	const { name, image, role } = user;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					className="relative h-10 cursor-pointer gap-2 px-2"
					variant="ghost"
				>
					<Avatar className="h-8 w-8">
						<AvatarImage
							alt="User"
							src={image ?? "/placeholder.svg?height=32&width=32"}
						/>
						<AvatarFallback>{getInitials(name)}</AvatarFallback>
					</Avatar>
					<div className="hidden flex-col items-start text-left md:flex">
						<span className="font-medium text-sm">{getUserName(name)}</span>
						<span className="text-muted-foreground text-xs">
							{capitalize(role.toLowerCase())}
						</span>
					</div>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>My Account</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem>Profile</DropdownMenuItem>
				<DropdownMenuItem>Billing</DropdownMenuItem>
				<DropdownMenuItem>Settings</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem className="text-destructive">
					<LogoutButton />
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default UserProfile;
