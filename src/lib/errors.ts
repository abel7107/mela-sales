export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    public params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}
export const notFound = (code = 'NOT_FOUND') => new AppError(404, code);
