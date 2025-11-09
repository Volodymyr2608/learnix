import { ArrowRight } from "lucide-react"
import {Button} from "@/app/_components/_shared/ui/button";

const CTASection = () => {
  return (
    <section className="py-24 px-4">
      <div className="container mx-auto max-w-7xl">
        <div className="bg-primary rounded-2xl p-12 md:p-16 text-center text-primary-foreground">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Ready to Start Learning?</h2>
          <p className="text-lg md:text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Join over 50,000 students and start your journey to success today. Get access to all courses with a free
            trial.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="text-lg">
              Start Free Trial
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary bg-transparent"
            >
              View Pricing
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default CTASection;
