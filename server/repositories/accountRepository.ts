import type { Account } from "better-auth";
import type {
	AccountCreateDto,
	AccountUpdateDto,
} from "@/server/entities/account";
import BaseRepository from "@/server/repositories/baseRepository";

export default class AccountRepository extends BaseRepository<
	Account,
	AccountCreateDto,
	AccountUpdateDto
> {
	protected readonly model = "account";
}

export const accountRepository = new AccountRepository();
