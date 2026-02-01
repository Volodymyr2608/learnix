const DRAFT_STEPS = {
	BASIC: "basic",
	OBJECTIVES: "objectives",
	REQUIREMENTS: "requirements",
	CURRICULUM: "curriculum",
} as const;

export const STEP_PROMPTS = {
	[DRAFT_STEPS.BASIC]: `
    Focus: General course information.
    Task: Generate or update 'title', 'subtitle', 'description', 'category', 'level', 'language' and 'duration'.
    Requirements:
    - Title should be catchy (max 60 chars).
    - Description should be a professional summary (50-500 chars).
    - Level must be one of the following exact values: "Beginner", "Intermediate", "Advanced", or "All".
		- Category must be one of the following exact values: "Development", "Design", "Business", "Marketing", or "Data-science".
		- Language must be one of the following exact values: "English", "Spanish", "French", or "German".
		- Duration should be a number representing hours as a decimal (e.g., 3.5), with a minimum of 0.5 and a maximum of 40.
  `,

	[DRAFT_STEPS.OBJECTIVES]: `
    Focus: Learning outcomes.
    Task: Generate or update the 'objectives' array.
    Requirements:
    - Provide exactly 4-6 distinct learning objectives.
    - Each objective must be a short string starting with an action verb (e.g., "Build", "Understand", "Implement").
    - Objectives should justify the course value to the student.
  `,

	[DRAFT_STEPS.REQUIREMENTS]: `
    Focus: Prerequisites.
    Task: Generate or update the 'requirements' array.
    Requirements:
    - List 3-5 necessary tools, skills, or prior knowledge.
    - Keep them concise and realistic for the chosen course level.
    - If no special tools are needed, suggest "Basic computer literacy" or "Interest in the topic".
  `,

	[DRAFT_STEPS.CURRICULUM]: `
    Focus: Full course structure.
    Task: Generate or update the 'sections' array.
    Requirements:
    - Create 4-6 sections that logically cover the topic from start to finish.
    - Each section must contain 3-5 lessons.
    - Each lesson needs a 'title' and a 'duration' string (e.g., "10 min").
    - Ensure the curriculum flows naturally: Intro -> Core Concepts -> Advanced Practice -> Project/Summary.
  `,
};
