import Link from "next/link";
import Logo from "@/app/_components/_shared/Logo";
import { Button } from "@/app/_components/_shared/ui/button";

export function Header() {
	return (
		<header className="border-border border-b bg-background">
			<div className="container mx-auto flex h-16 items-center justify-between px-4">
				<div className="flex items-center gap-8">
					<Logo />

					<nav className="hidden items-center gap-6 md:flex">
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/courses"
						>
							Courses
						</Link>
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/programs"
						>
							Programs
						</Link>
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/resources"
						>
							Resources
						</Link>
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/pricing"
						>
							Pricing
						</Link>
						<Link
							className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/instructors"
						>
							Teach
						</Link>
					</nav>
				</div>

				<div className="flex items-center gap-4">
					<Button asChild className="hidden sm:inline-flex" variant="ghost">
						<Link href="/sign-in">Sign In</Link>
					</Button>
					<Button asChild>
						<Link href="/sign-up">Get Started</Link>
					</Button>
				</div>
			</div>
		</header>
	);
}
