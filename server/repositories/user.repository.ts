import type { User } from "better-auth";
import type { Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class UserRepository extends BaseRepository<
	"user",
	User,
	Prisma.UserCreateInput,
	Prisma.UserUpdateInput,
	Prisma.UserWhereInput,
	Prisma.UserInclude,
	Prisma.UserSelect,
	Prisma.UserOrderByWithRelationInput
> {
	protected readonly modelName = "user" as const;
}

export const userRepository = new UserRepository();
