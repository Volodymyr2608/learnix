import { SKILLS } from "@/lib/constants/skills";
import { db } from "@/server/db";

async function main() {
	for (const { name, slug } of SKILLS) {
		await db.skill.upsert({
			where: { slug },
			create: { name, slug },
			update: { name },
		});
	}

	console.log(`Seeded ${SKILLS.length} skills`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => db.$disconnect());
