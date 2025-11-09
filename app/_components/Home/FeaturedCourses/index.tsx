import { Button } from "@/app/_components/_shared/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/app/_components/_shared/ui/card"
import { BookOpen, Clock, Users } from "lucide-react"

const courses = [
  {
    id: 1,
    title: "Web Development Fundamentals",
    description: "Master HTML, CSS, and JavaScript to build modern websites from scratch.",
    image: "/web-development-coding-screen.png",
    instructor: "Sarah Johnson",
    students: 12500,
    duration: "8 weeks",
    level: "Beginner",
  },
  {
    id: 2,
    title: "Data Science with Python",
    description: "Learn data analysis, visualization, and machine learning with Python.",
    image: "/data-science-python-analytics.jpg",
    instructor: "Michael Chen",
    students: 9800,
    duration: "10 weeks",
    level: "Intermediate",
  },
  {
    id: 3,
    title: "UI/UX Design Masterclass",
    description: "Create beautiful, user-centered designs with industry-standard tools.",
    image: "/ui-ux-design-interface-mockup.jpg",
    instructor: "Emma Williams",
    students: 8200,
    duration: "6 weeks",
    level: "Beginner",
  },
]

const FeaturedCourses = () => {
  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-balance">Featured Courses</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Explore our most popular courses designed by industry experts to help you achieve your learning goals.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {courses.map((course) => (
            <Card key={course.id} className="flex flex-col overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-video overflow-hidden">
                <img
                  src={course.image || "/placeholder.svg"}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <CardHeader>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium">
                    {course.level}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-balance">{course.title}</h3>
                <p className="text-muted-foreground text-sm text-pretty">{course.description}</p>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{course.students.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{course.duration}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{course.instructor}</span>
                </div>
                <Button size="sm">Enroll</Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="text-center">
          <Button variant="outline" size="lg">
            View All Courses
          </Button>
        </div>
      </div>
    </section>
  )
}

export default FeaturedCourses;
