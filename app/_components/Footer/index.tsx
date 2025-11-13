import { Facebook, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";
import Link from "next/link";

const Footer = () => {
	return (
		<footer className="border-t bg-muted/50">
			<div className="container mx-auto max-w-7xl px-4 py-12">
				<div className="mb-8 grid grid-cols-2 gap-8 md:grid-cols-4">
					<div>
						<h3 className="mb-4 font-semibold">Platform</h3>
						<ul className="space-y-2">
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/courses"
								>
									Browse Courses
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/programs"
								>
									Learning Paths
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/instructors"
								>
									Become Instructor
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/pricing"
								>
									Pricing
								</Link>
							</li>
						</ul>
					</div>

					<div>
						<h3 className="mb-4 font-semibold">Company</h3>
						<ul className="space-y-2">
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/about"
								>
									About Us
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/careers"
								>
									Careers
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/blog"
								>
									Blog
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/contact"
								>
									Contact
								</Link>
							</li>
						</ul>
					</div>

					<div>
						<h3 className="mb-4 font-semibold">Resources</h3>
						<ul className="space-y-2">
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/help"
								>
									Help Center
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/community"
								>
									Community
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/guides"
								>
									Guides
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/webinars"
								>
									Webinars
								</Link>
							</li>
						</ul>
					</div>

					<div>
						<h3 className="mb-4 font-semibold">Legal</h3>
						<ul className="space-y-2">
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/terms"
								>
									Terms of Service
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/privacy"
								>
									Privacy Policy
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/cookies"
								>
									Cookie Policy
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground transition-colors hover:text-foreground"
									href="/accessibility"
								>
									Accessibility
								</Link>
							</li>
						</ul>
					</div>
				</div>

				<div className="flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row">
					<div className="text-muted-foreground text-sm">
						© 2025 EduPlatform. All rights reserved.
					</div>

					<div className="flex gap-4">
						<Link
							className="text-muted-foreground transition-colors hover:text-foreground"
							href="#"
						>
							<Facebook className="h-5 w-5" />
							<span className="sr-only">Facebook</span>
						</Link>
						<Link
							className="text-muted-foreground transition-colors hover:text-foreground"
							href="#"
						>
							<Twitter className="h-5 w-5" />
							<span className="sr-only">Twitter</span>
						</Link>
						<Link
							className="text-muted-foreground transition-colors hover:text-foreground"
							href="#"
						>
							<Instagram className="h-5 w-5" />
							<span className="sr-only">Instagram</span>
						</Link>
						<Link
							className="text-muted-foreground transition-colors hover:text-foreground"
							href="#"
						>
							<Linkedin className="h-5 w-5" />
							<span className="sr-only">LinkedIn</span>
						</Link>
						<Link
							className="text-muted-foreground transition-colors hover:text-foreground"
							href="#"
						>
							<Youtube className="h-5 w-5" />
							<span className="sr-only">YouTube</span>
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
};

export default Footer;
