import { BookOpen, Users, Award, Clock } from "lucide-react"

const FeaturesSection = () => {
  const features = [
    {
      icon: BookOpen,
      title: "Expert-Led Courses",
      description: "Learn from industry professionals with years of real-world experience",
    },
    {
      icon: Users,
      title: "Community Support",
      description: "Join a vibrant community of learners and get help when you need it",
    },
    {
      icon: Award,
      title: "Certified Learning",
      description: "Earn recognized certificates upon course completion to boost your career",
    },
    {
      icon: Clock,
      title: "Learn at Your Pace",
      description: "Access courses anytime, anywhere with lifetime access to materials",
    },
  ]

  return (
    <section className="py-24 px-4">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Why Choose Our Platform</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We provide everything you need to succeed in your learning journey
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <feature.icon className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default FeaturesSection;
