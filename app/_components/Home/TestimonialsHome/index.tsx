import { Card } from "@/app/_components/_shared/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/_components/_shared/ui/avatar"
import { Star } from "lucide-react"

const testimonials = [
  {
    name: "Sarah Johnson",
    role: "Software Developer",
    avatar: "/professional-woman-smiling.png",
    content:
      "This platform transformed my career. The courses are well-structured and the instructors are incredibly knowledgeable. I landed my dream job within 3 months!",
    rating: 5,
  },
  {
    name: "Michael Chen",
    role: "Data Analyst",
    avatar: "/professional-man-smiling.png",
    content:
      "The best investment I've made in my education. The hands-on projects and real-world examples made learning practical and engaging.",
    rating: 5,
  },
  {
    name: "Emily Rodriguez",
    role: "UX Designer",
    avatar: "/professional-woman-designer.png",
    content:
      "I love the flexibility and quality of content. Being able to learn at my own pace while getting support from the community has been amazing.",
    rating: 5,
  },
]

const TestimonialsHome = () => {
  return (
    <section className="py-24 px-4 bg-muted/30">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">What Our Students Say</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join thousands of successful learners who have transformed their careers
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="p-6">
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-muted-foreground mb-6">{testimonial.content}</p>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={testimonial.avatar || "/placeholder.svg"} alt={testimonial.name} />
                  <AvatarFallback>
                    {testimonial.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

export default TestimonialsHome;
