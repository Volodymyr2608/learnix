import {AccountSchema} from "@/prisma/zod";
import {z} from "zod/index";

export const AccountCreateDto = AccountSchema.pick({
  providerId: true,
  accountId: true,
  password: true,
  userId: true,
});

export type AccountCreateDto = z.infer<typeof AccountCreateDto>;

export const AccountUpdateDto = AccountSchema.pick({
  password: true,
}).partial();

export type AccountUpdateDto = z.infer<typeof AccountUpdateDto>;