import jwt from "jsonwebtoken";
import { type Request, type Response, type NextFunction } from "express";
import { ApiError } from "../middlewares/errorHandler";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is required.");

export interface JwtPayload {
  userId: number;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET!) as JwtPayload;
}

export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new ApiError(401, "UNAUTHORIZED", "Missing or invalid authorization header"));
    return;
  }
  const token = header.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(new ApiError(401, "UNAUTHORIZED", "Invalid or expired token"));
  }
}
