"use client";

import { Menu } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/_components/_shared/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/app/_components/_shared/ui/sheet";

const NAV_LINKS = [
	{ href: "/courses", label: "Courses" },
	{ href: "/programs", label: "Programs" },
	{ href: "/resources", label: "Resources" },
	{ href: "/pricing", label: "Pricing" },
	{ href: "/instructors", label: "Teach" },
];

export const MobileNav = () => {
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					aria-label="Open menu"
					className="md:hidden"
					size="icon"
					variant="ghost"
				>
					<Menu className="h-5 w-5" />
				</Button>
			</SheetTrigger>
			<SheetContent side="left">
				<SheetTitle className="sr-only">Menu</SheetTitle>
				<nav className="flex flex-col gap-1 p-4">
					{NAV_LINKS.map((link) => (
						<SheetClose asChild key={link.href}>
							<Link
								className="rounded-md px-3 py-2 font-medium text-sm hover:bg-accent"
								href={link.href}
							>
								{link.label}
							</Link>
						</SheetClose>
					))}
				</nav>
				<div className="mt-auto flex flex-col gap-2 border-t p-4">
					<SheetClose asChild>
						<Button asChild variant="ghost">
							<Link href="/sign-in">Sign In</Link>
						</Button>
					</SheetClose>
					<SheetClose asChild>
						<Button asChild>
							<Link href="/sign-up">Get Started</Link>
						</Button>
					</SheetClose>
				</div>
			</SheetContent>
		</Sheet>
	);
};
