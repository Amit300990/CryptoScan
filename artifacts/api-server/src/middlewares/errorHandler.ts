import { type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof ApiError) {
    logger.warn(
      {
        statusCode: err.statusCode,
        code: err.code,
        path: req.path,
        method: req.method,
        userId: req.user?.userId,
      },
      err.message,
    );
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  logger.error(
    {
      err,
      path: req.path,
      method: req.method,
      userId: req.user?.userId,
    },
    "Unhandled error",
  );

  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    timestamp: new Date().toISOString(),
  });
};
