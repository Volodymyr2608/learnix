import Link from "next/link"
import { Button } from "@/app/_components/_shared/ui/button"
import { BookOpen } from "lucide-react"

export function Header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            <span className="text-xl font-semibold">Learnix</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/courses"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Courses
            </Link>
            <Link
              href="/programs"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Programs
            </Link>
            <Link
              href="/resources"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Resources
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/instructors"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Teach
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link href="/sign-in">Sign In</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
