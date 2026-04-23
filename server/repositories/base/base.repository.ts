import type { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";
import type Paginator from "@/server/repositories/base/paginator";
import { hasId } from "@/server/utils/hasId";

type ModelName = {
	[K in keyof typeof db]: (typeof db)[K] extends {
		findMany: (...args: any[]) => any;
	}
		? K
		: never;
}[keyof typeof db];
type ModelDelegate<TModel extends ModelName> = (typeof db)[TModel];
type FindUniqueOrThrowArgs<TModel extends ModelName> = Prisma.Args<
	ModelDelegate<TModel>,
	"findUniqueOrThrow"
>;
type FindFirstArgs<TModel extends ModelName> = Prisma.Args<
	ModelDelegate<TModel>,
	"findFirst"
>;
type FindManyArgs<TModel extends ModelName> = Prisma.Args<
	ModelDelegate<TModel>,
	"findMany"
>;

/**
 * Base Repository
 *
 * @template TModel - Prisma model delegate (e.g., db.user)
 * @template TPayload - The result type from Prisma operations
 * @template TCreateInput - Prisma create input type
 * @template TUpdateInput - Prisma update input type
 * @template TWhere - Prisma where input type
 * @template TInclude - Prisma include input type
 * @template TSelect - Prisma select input type
 * @template TOrderBy - Prisma orderBy input type
 */
export abstract class BaseRepository<
	TModel extends ModelName,
	TPayload,
	TCreateInput,
	TUpdateInput,
	TWhere,
	TInclude,
	TSelect,
	TOrderBy,
> {
	protected abstract readonly modelName: TModel;
	protected readonly isSoftDelete: boolean = false;

	protected get model() {
		return db[this.modelName] as any;
	}

	protected get db() {
		return db;
	}

	protected readonly logger?: {
		info: (message: string, meta?: Record<string, unknown>) => void;
		error: (message: string, meta?: Record<string, unknown>) => void;
		warn: (message: string, meta?: Record<string, unknown>) => void;
		debug: (message: string, meta?: Record<string, unknown>) => void;
	};

	/**
	 * Handles operation errors by logging the error and throwing a formatted error message
	 *
	 * @param error The caught error
	 * @param operation Description of the operation that failed
	 * @param context Additional context information for logging
	 * @throws Error with a formatted message
	 */
	protected handleError(
		error: unknown,
		operation: string,
		context: Record<string, unknown> = {},
	): never {
		// Log the error with context
		this.logger?.error(`Failed to ${operation}`, { ...context, error });

		// Format the error message
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Throw a new error with the formatted message
		throw new Error(`Failed to ${operation}: ${errorMessage}`);
	}

	public async findOne<
		TArgs extends Omit<FindUniqueOrThrowArgs<TModel>, "where"> = Omit<
			FindUniqueOrThrowArgs<TModel>,
			"where"
		>,
	>(
		id: string,
		options?: Prisma.SelectSubset<
			TArgs,
			Omit<FindUniqueOrThrowArgs<TModel>, "where">
		> & {
			idField?: string;
		},
	): Promise<Prisma.Result<ModelDelegate<TModel>, TArgs, "findUniqueOrThrow">> {
		try {
			const source = (options ?? {}) as TArgs & { idField?: string };
			const { idField = "id", ...prismaOptions } = source;

			const query = {
				...prismaOptions,
				where: { [idField]: id },
			} as FindUniqueOrThrowArgs<TModel>;

			return await this.model.findUniqueOrThrow(query);
		} catch (error) {
			return this.handleError(error, `find entity with ID ${id}`, { id });
		}
	}

	public async findFirst<
		TArgs extends FindFirstArgs<TModel> = FindFirstArgs<TModel>,
	>(
		options?: Prisma.SelectSubset<TArgs, FindFirstArgs<TModel>>,
	): Promise<Prisma.Result<ModelDelegate<TModel>, TArgs, "findFirst">> {
		try {
			const source = (options ?? {}) as FindFirstArgs<TModel>;
			const query = {
				...source,
				where: this.buildWhere(source.where as TWhere),
			} as FindFirstArgs<TModel>;

			return await this.model.findFirst(query);
		} catch (error) {
			return this.handleError(error, "find first entity", {
				options,
			});
		}
	}

	public async findMany<
		TArgs extends FindManyArgs<TModel> = FindManyArgs<TModel>,
	>(
		options?: Prisma.SelectSubset<TArgs, FindManyArgs<TModel>>,
	): Promise<Prisma.Result<ModelDelegate<TModel>, TArgs, "findMany">> {
		try {
			this.logger?.debug("Finding entities", { options });
			const source = (options ?? {}) as FindManyArgs<TModel>;
			const query = {
				...source,
				where: this.buildWhere(source.where as TWhere),
			} as FindManyArgs<TModel>;

			return await this.model.findMany(query);
		} catch (error) {
			return this.handleError(error, "find entities", { options });
		}
	}

	public async create(data: TCreateInput): Promise<TPayload> {
		try {
			this.logger?.info("Creating entity", { data });
			return await this.model.create({ data });
		} catch (error) {
			return this.handleError(error, "create entity", { data });
		}
	}

	public async bulkCreate(data: TCreateInput[]): Promise<number> {
		try {
			this.logger?.info("Bulk creating entities", { count: data.length });

			if (!this.model.createMany) {
				// Fallback to individual creates if createMany is not available
				const results = await Promise.all(data.map((dto) => this.create(dto)));
				return results.length;
			}

			const result = await this.model.createMany({
				data,
			});
			return result.count;
		} catch (error) {
			return this.handleError(error, "bulk create entities", {
				count: data.length,
			});
		}
	}

	public async createManyAndReturn(data: TCreateInput[]): Promise<TPayload[]> {
		try {
			this.logger?.info("Creating entities", { count: data.length });

			if (!this.model.createManyAndReturn) {
				// Fallback to individual creates if createMany is not available
				return await Promise.all(data.map((dto) => this.create(dto)));
			}

			return await this.model.createManyAndReturn({ data });
		} catch (error) {
			return this.handleError(error, "crete many and return entities", {
				count: data.length,
			});
		}
	}

	public async update(
		id: string,
		data: TUpdateInput,
		idField: string = "id",
	): Promise<TPayload> {
		try {
			this.logger?.info("Updating entity", { id, data });
			return await this.model.update({
				where: { [idField]: id },
				data,
			});
		} catch (error) {
			return this.handleError(error, `update entity with ID ${id}`, {
				id,
				data,
			});
		}
	}

	public async bulkUpdate(ids: string[], data: TUpdateInput): Promise<number> {
		try {
			this.logger?.info("Bulk updating entities", { ids, data });

			if (!this.model.updateMany) {
				// Fallback to individual updates if updateMany is not available
				const results = await Promise.all(
					ids.map((id) => this.update(id, data)),
				);
				return results.length;
			}

			const result = await this.model.updateMany({
				where: { id: { in: ids } },
				data,
			});
			return result.count;
		} catch (error) {
			return this.handleError(error, "bulk update entities", { ids, data });
		}
	}

	public async updateMany(where: TWhere, data: TUpdateInput): Promise<number> {
		try {
			this.logger?.info("Updating entities", { where, data });

			if (!this.model.updateMany) {
				// Fallback to individual updates if updateMany is not available
				const entities = (await this.findMany({
					where,
				} as FindManyArgs<TModel>)) as TPayload[];

				const results = await Promise.all(
					entities.map((entity) => {
						if (hasId(entity)) {
							return this.model.update({
								where: { id: entity.id },
								data,
							});
						}

						return null;
					}),
				);

				return results.filter(Boolean).length;
			}

			const result = await this.model.updateMany({
				where: this.buildWhere(where),
				data,
			});

			return result.count;
		} catch (error) {
			return this.handleError(error, "update entities", { where, data });
		}
	}

	public async delete(
		id: string,
		softDelete: boolean = this.isSoftDelete,
	): Promise<boolean> {
		try {
			this.logger?.info("Deleting entity", { id, softDelete });
			if (softDelete) {
				await this.model.update({
					where: { id },
					data: { deletedAt: new Date() },
				});
			} else {
				// Direct call to repo.delete instead of forceDelete to avoid nested error messages
				await this.model.delete({ where: { id } });
			}
			return true;
		} catch (error) {
			return this.handleError(error, `delete entity with ID ${id}`, {
				id,
				softDelete,
			});
		}
	}

	public async forceDelete(id: string): Promise<boolean> {
		try {
			this.logger?.info("Force deleting entity", { id });
			await this.model.delete({ where: { id } });
			return true;
		} catch (error) {
			return this.handleError(error, `force delete entity with ID ${id}`, {
				id,
			});
		}
	}

	public async bulkDelete(
		ids: string[],
		softDelete: boolean = this.isSoftDelete,
	): Promise<number> {
		try {
			this.logger?.info("Bulk deleting entities", { ids, softDelete });

			if (softDelete) {
				if (!this.model.updateMany) {
					// Fallback to individual soft deletes
					const results = await Promise.all(
						ids.map((id) => this.delete(id, true)),
					);
					return results.filter(Boolean).length;
				}

				const result = await this.model.updateMany({
					where: { id: { in: ids } },
					data: { deletedAt: new Date() } as unknown as unknown,
				});
				return result.count;
			} else {
				if (!this.model.deleteMany) {
					// Fallback to individual hard deletes
					const results = await Promise.all(
						ids.map((id) => this.forceDelete(id)),
					);
					return results.filter(Boolean).length;
				}

				const result = await this.model.deleteMany({
					where: { id: { in: ids } },
				});
				return result.count;
			}
		} catch (error) {
			return this.handleError(error, "bulk delete entities", {
				ids,
				softDelete,
			});
		}
	}

	public async deleteMany(
		where: TWhere,
		softDelete: boolean = this.isSoftDelete,
	): Promise<number> {
		try {
			this.logger?.info("Deleting entities", { where, softDelete });

			if (softDelete) {
				// Verify model supports soft delete
				if (!this.isSoftDelete) {
					// Don't log an error here, just throw
					throw new Error("Soft delete not supported for this model");
				}

				// For soft delete, don't exclude already deleted records
				const baseFilter = { ...where };
				if (this.model.updateMany) {
					const { count } = await this.model.updateMany({
						where: baseFilter,
						data: { deletedAt: new Date() },
					});

					return count;
				}
			} else if (this.model.deleteMany) {
				const { count } = await this.model.deleteMany({
					where: this.buildWhere(where),
				});

				return count;
			}
			return 0;
		} catch (error) {
			// Special case for soft delete not supported error
			if (
				error instanceof Error &&
				error.message === "Soft delete not supported for this model"
			) {
				throw error; // Just rethrow without logging
			}
			return this.handleError(error, "delete entities", { where, softDelete });
		}
	}

	public async count(where?: TWhere): Promise<number> {
		try {
			this.logger?.debug("Counting entities", { where });
			return this.model.count({ where: this.buildWhere(where) });
		} catch (error) {
			return this.handleError(error, "count entities", { where });
		}
	}

	public async paginate(options: {
		page?: number;
		perPage?: number;
		where?: TWhere;
		include?: TInclude;
		select?: TSelect;
		orderBy?: TOrderBy | TOrderBy[];
	}): Promise<Paginator<TPayload>> {
		const page = options.page || 1;
		const perPage = options.perPage || 10;

		try {
			this.logger?.debug("Paginating entities", {
				perPage,
				page,
				where: options.where,
				orderBy: options.orderBy,
			});

			const [total, data] = await Promise.all([
				this.count(options.where),
				this.findMany({
					where: options.where,
					include: options.include,
					select: options.select,
					orderBy: options.orderBy,
					skip: (page - 1) * perPage,
					take: perPage,
				} as FindManyArgs<TModel>),
			]);

			const paginatedData = data as TPayload[];

			return {
				data: paginatedData,
				total,
				currentPage: page,
				lastPage: Math.ceil(total / perPage),
				perPage,
				from: (page - 1) * perPage,
				to: (page - 1) * perPage + paginatedData.length,
			};
		} catch (error) {
			return this.handleError(error, "paginate entities", {
				perPage,
				page,
				where: options.where,
				orderBy: options.orderBy,
			});
		}
	}

	public async restore(id: string): Promise<TPayload> {
		try {
			if (!this.isSoftDelete) {
				this.logger?.error("Restore not supported", { id });
				throw new Error("Restore not supported for this repository");
			}

			this.logger?.info("Restoring entity", { id });
			return await this.model.update({
				where: { id },
				data: { deletedAt: null },
			});
		} catch (error) {
			// Special case for restore not supported error
			if (
				error instanceof Error &&
				error.message === "Restore not supported for this repository"
			) {
				throw error; // Just rethrow without additional formatting
			}
			return this.handleError(error, `restore entity with ID ${id}`, { id });
		}
	}

	public async transaction<R>(
		callback: (tx: Prisma.TransactionClient) => Promise<R>,
	): Promise<R> {
		try {
			this.logger?.info("Starting transaction");
			const result = await db.$transaction(callback);
			this.logger?.info("Transaction completed successfully");
			return result;
		} catch (error) {
			return this.handleError(error, "execute transaction");
		}
	}

	/**
	 * Build where clause with a soft delete filter
	 */
	protected buildWhere(where?: TWhere): TWhere {
		if (!this.isSoftDelete) return where as TWhere;

		return {
			deletedAt: null,
			...where,
		} as TWhere;
	}
}
