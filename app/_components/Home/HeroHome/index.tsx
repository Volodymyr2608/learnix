import { ArrowRight, Play } from "lucide-react"
import Link from "next/link"
import { Button } from "@/app/_components/_shared/ui/button";

const HeroHome = () =>  {
  return (
    <section className="container mx-auto px-4 py-20 md:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-block rounded-full bg-secondary px-4 py-1.5 text-sm font-medium text-secondary-foreground">
          {"🎓 New courses launching this month"}
        </div>

        <h1 className="mb-6 text-balance text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
          {"Learn skills that shape your future"}
        </h1>

        <p className="mb-10 text-pretty text-lg text-muted-foreground md:text-xl">
          {
            "Access world-class education from anywhere. Master new skills with expert-led courses, interactive projects, and a supportive learning community."
          }
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" asChild className="w-full sm:w-auto">
            <Link href="/explore">
              Explore Courses
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="w-full sm:w-auto bg-transparent">
            <Link href="/demo">
              <Play className="mr-2 h-4 w-4" />
              Watch Demo
            </Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          <div className="flex flex-col items-center">
            <div className="mb-2 text-3xl font-bold">10,000+</div>
            <div className="text-sm text-muted-foreground">Active Learners</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="mb-2 text-3xl font-bold">500+</div>
            <div className="text-sm text-muted-foreground">Expert Courses</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="mb-2 text-3xl font-bold">95%</div>
            <div className="text-sm text-muted-foreground">Success Rate</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default HeroHome;
