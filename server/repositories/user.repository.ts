import type { User } from "better-auth";
import type {
	UserCreateDto,
	UserCreatePayload,
	UserUpdateDto,
} from "@/server/entities/user";
import type AccountRepository from "@/server/repositories/account.repository";
import { accountRepository } from "@/server/repositories/account.repository";
import BaseRepository from "@/server/repositories/baseRepository";

export default class UserRepository extends BaseRepository<
	User,
	UserCreateDto,
	UserUpdateDto
> {
	protected readonly model = "user";

	private accountRepository: AccountRepository;

	constructor() {
		super();
		this.accountRepository = accountRepository;
	}

	public async createUser(userPayload: UserCreatePayload) {
		return this.transaction(async () => {
			const { email, name, hashedPassword } = userPayload;

			const user = await this.create({ email, name });

			const account = await this.accountRepository.create({
				password: hashedPassword,
				accountId: email,
				userId: user.id,
				providerId: "email",
			});

			return { user, account };
		});
	}
}

export const userRepository = new UserRepository();
