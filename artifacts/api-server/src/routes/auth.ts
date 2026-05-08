import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { signToken, jwtAuthMiddleware } from "../lib/jwtAuth";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";

const router: IRouter = Router();

const RegisterBody = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().max(100).optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/auth/register",
  asyncHandler(async (req, res): Promise<void> => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid input");
    }
    const { email, password, name } = parsed.data;

    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()));
    if (existing) {
      throw new ApiError(409, "CONFLICT", "An account with that email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({ email: email.toLowerCase(), passwordHash, name: name ?? null })
      .returning();

    const token = signToken({ userId: user.id, email: user.email });
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  }),
);

router.post(
  "/auth/login",
  asyncHandler(async (req, res): Promise<void> => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid email or password format");
    }
    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()));
    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid email or password");
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  }),
);

router.get(
  "/auth/me",
  jwtAuthMiddleware,
  asyncHandler(async (req, res): Promise<void> => {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId));
    if (!user) {
      throw new ApiError(404, "NOT_FOUND", "User not found");
    }
    res.json(user);
  }),
);

export default router;
