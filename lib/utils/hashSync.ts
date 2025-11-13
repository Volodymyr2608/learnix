import bcrypt from "bcrypt";

export const hashSync = (data: string) => bcrypt.hashSync(data, 11);
