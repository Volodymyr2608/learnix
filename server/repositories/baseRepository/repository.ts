// import type Paginator from "@/server/repositories/baseRepository/paginator";

export type Filter = Record<string, unknown>;
export type OrderBy = Record<string, "asc" | "desc">;

export interface Repository<T, TCreateDto, _TUpdateDto> {
	create(data: TCreateDto): Promise<T>;
	// update(id: string, dto: TUpdateDto, idField: string): Promise<T>;
	// delete(id: string, softDelete?: boolean): Promise<boolean>;
	// findOne(id: string, include: object | null | undefined, idField: string): Promise<T>;
	findFirst(
		filter?: Filter,
		orderBy?: OrderBy,
		include?: object | null,
	): Promise<T | null>;
	transaction<R>(callback: (prismaClient: unknown) => Promise<R>): Promise<R>;
	// findMany(filter?: Filter, skip?: number, take?: number, orderBy?: OrderBy): Promise<T[]>;
	// count(filter?: Filter): Promise<number>;
	// paginate(perPage?: number, page?: number, filter?: Filter, orderBy?: OrderBy): Promise<Paginator<T>>;
}
