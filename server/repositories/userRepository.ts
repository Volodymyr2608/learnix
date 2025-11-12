import type { User } from "better-auth";
import type {SignUpData, UserCreateDto, UserUpdateDto} from "@/server/entities/user";
import BaseRepository from "@/server/repositories/baseRepository";
import {db} from "@/server/db";
import type AccountRepository from "@/server/repositories/accountRepository";
import {accountRepository} from "@/server/repositories/accountRepository";
import {UserCreatePayload} from "@/server/entities/user";

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
        providerId: 'email'
      })

      console.log({ user, account })
      return { user, account }
    })
  }
}

export const userRepository = new UserRepository();
