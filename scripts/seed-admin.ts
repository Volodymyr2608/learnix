import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";

const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
	console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local");
	process.exit(1);
}

const email = ADMIN_EMAIL;
const password = ADMIN_PASSWORD;

async function main() {
	const existing = await db.user.findUnique({ where: { email } });

	if (!existing) {
		await auth.api.signUpEmail({
			body: { email, password, name: "Admin" },
		});
	}

	await db.user.update({
		where: { email },
		data: { role: "ADMIN", emailVerified: true },
	});

	console.log(`Admin seeded: ${email}`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => db.$disconnect());
