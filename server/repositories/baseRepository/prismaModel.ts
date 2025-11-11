import type { Filter } from "@/server/repositories/baseRepository/repository";

export type PrismaModel = {
	create: (args: { data: unknown }) => Promise<unknown>;
	update: (args: { where: Filter; data: unknown }) => Promise<unknown>;
	findUniqueOrThrow: (args: {
		where: Filter;
		include: object | null | undefined;
	}) => Promise<unknown>;
	findFirst: (args: {
		where: Filter;
		orderBy?: Record<string, "asc" | "desc">;
		include: object | null | undefined;
	}) => Promise<unknown | null>;
	findMany: (args: {
		where: Filter;
		select?: Record<string, boolean | object>;
		skip?: number;
		take?: number;
		orderBy?: Record<string, "asc" | "desc">;
		include?: object | null | undefined;
	}) => Promise<unknown[]>;
	count: (args: { where: Filter }) => Promise<number>;
	delete: (args: { where: { id: string } }) => Promise<unknown>;
};
