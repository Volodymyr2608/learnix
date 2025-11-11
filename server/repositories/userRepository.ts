import type { User } from "better-auth";
import type { UserCreateDto, UserUpdateDto } from "@/server/entities/user";
import BaseRepository from "@/server/repositories/baseRepository";

export default class UserRepository extends BaseRepository<
	User,
	UserCreateDto,
	UserUpdateDto
> {
	protected readonly model = "user";
}

export const userRepository = new UserRepository();
