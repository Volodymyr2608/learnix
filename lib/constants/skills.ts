export const SKILLS = [
	{ name: "React", slug: "react" },
	{ name: "TypeScript", slug: "typescript" },
	{ name: "JavaScript", slug: "javascript" },
	{ name: "Python", slug: "python" },
	{ name: "Node.js", slug: "nodejs" },
	{ name: "SQL", slug: "sql" },
	{ name: "Data Analysis", slug: "data-analysis" },
	{ name: "Machine Learning", slug: "machine-learning" },
	{ name: "UI/UX Design", slug: "ui-ux-design" },
	{ name: "Graphic Design", slug: "graphic-design" },
	{ name: "Digital Marketing", slug: "digital-marketing" },
	{ name: "SEO", slug: "seo" },
	{ name: "Project Management", slug: "project-management" },
	{ name: "Cloud Computing", slug: "cloud-computing" },
	{ name: "DevOps", slug: "devops" },
	{ name: "Mobile Development", slug: "mobile-development" },
] as const;

export type SkillSlug = (typeof SKILLS)[number]["slug"];
