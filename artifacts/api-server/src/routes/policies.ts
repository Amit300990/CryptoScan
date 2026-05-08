import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, policyRulesTable } from "@workspace/db";
import {
  CreatePolicyBody,
  UpdatePolicyParams,
  UpdatePolicyBody,
  DeletePolicyParams,
} from "@workspace/api-zod";
import { writeLog } from "../lib/writeLog";
import { asyncHandler, ApiError } from "../middlewares/errorHandler";

const router: IRouter = Router();

type PolicyRow = InferSelectModel<typeof policyRulesTable>;

function parsePolicy(p: PolicyRow) {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get(
  "/policies",
  asyncHandler(async (_req, res): Promise<void> => {
    const policies = await db
      .select()
      .from(policyRulesTable)
      .orderBy(policyRulesTable.createdAt);
    res.json(policies.map(parsePolicy));
  }),
);

router.post(
  "/policies",
  asyncHandler(async (req, res): Promise<void> => {
    const parsed = CreatePolicyBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    const [policy] = await db
      .insert(policyRulesTable)
      .values({ ...parsed.data, enabled: parsed.data.enabled ?? true })
      .returning();
    void writeLog({
      category: "policy",
      message: `Policy created: "${policy.name}" (${policy.severity}, ${policy.category})`,
      metadata: { policyId: policy.id },
    });
    res.status(201).json(parsePolicy(policy));
  }),
);

router.put(
  "/policies/:id",
  asyncHandler(async (req, res): Promise<void> => {
    const params = UpdatePolicyParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }
    const parsed = UpdatePolicyBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.message);
    }
    const [policy] = await db
      .update(policyRulesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(policyRulesTable.id, params.data.id))
      .returning();
    if (!policy) {
      throw new ApiError(404, "NOT_FOUND", "Policy not found");
    }
    const action =
      parsed.data.enabled !== undefined
        ? `Policy "${policy.name}" ${policy.enabled ? "enabled" : "disabled"}`
        : `Policy updated: "${policy.name}"`;
    void writeLog({
      category: "policy",
      message: action,
      metadata: { policyId: policy.id, enabled: policy.enabled },
    });
    res.json(parsePolicy(policy));
  }),
);

router.delete(
  "/policies/:id",
  asyncHandler(async (req, res): Promise<void> => {
    const params = DeletePolicyParams.safeParse(req.params);
    if (!params.success) {
      throw new ApiError(400, "VALIDATION_ERROR", params.error.message);
    }
    const [policy] = await db
      .select()
      .from(policyRulesTable)
      .where(eq(policyRulesTable.id, params.data.id));
    await db.delete(policyRulesTable).where(eq(policyRulesTable.id, params.data.id));
    if (policy)
      void writeLog({
        category: "policy",
        message: `Policy deleted: "${policy.name}"`,
        metadata: { policyId: params.data.id },
      });
    res.sendStatus(204);
  }),
);

export default router;
