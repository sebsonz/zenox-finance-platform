import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../../../config/env.js";
import {
  clearUserSessionCookie,
  requireUserAuth,
  userSessionCookie,
  verifyRequestUser,
} from "../../../middleware/require-user-auth.js";
import { SupabaseTokenVerificationError } from "../services/supabase-user-verifier.service.js";

export const userSessionRouter = Router();

const exchangeSchema = z.object({
  accessToken: z.string().regex(/^[A-Za-z0-9._~-]{20,4096}$/),
}).strict();

function sameOrigin(req: Request): boolean {
  const origin = req.header("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host.toLowerCase() === (req.get("host") ?? "").toLowerCase();
  } catch {
    return false;
  }
}

function originFailure(res: Response): void {
  res.status(403).json({
    error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed." },
  });
}

userSessionRouter.get("/session/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    res.status(503).json({
      error: { code: "USER_AUTH_NOT_CONFIGURED", message: "User authentication is not configured." },
    });
    return;
  }
  res.status(200).json({ data: { supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY } });
});

userSessionRouter.post("/session", async (req, res) => {
  if (!sameOrigin(req)) {
    originFailure(res);
    return;
  }
  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "INVALID_SESSION_EXCHANGE", message: "A valid user access token is required." },
    });
    return;
  }
  try {
    const user = await verifyRequestUser(parsed.data.accessToken);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Set-Cookie", userSessionCookie(parsed.data.accessToken));
    res.status(200).json({ data: { id: user.id, ...(user.email ? { email: user.email } : {}) } });
  } catch (error) {
    if (error instanceof SupabaseTokenVerificationError) {
      const invalid = error.code === "INVALID_TOKEN";
      res.status(invalid ? 401 : 503).json({
        error: {
          code: invalid ? "INVALID_TOKEN" : "USER_AUTH_UNAVAILABLE",
          message: invalid ? "The user access token is invalid or expired." : "User authentication is temporarily unavailable.",
        },
      });
      return;
    }
    res.status(503).json({
      error: { code: "USER_AUTH_UNAVAILABLE", message: "User authentication is temporarily unavailable." },
    });
  }
});

userSessionRouter.get("/session", requireUserAuth(), (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    data: {
      id: req.financeUser?.id,
      ...(req.financeUser?.email ? { email: req.financeUser.email } : {}),
    },
  });
});

userSessionRouter.delete("/session", (req, res) => {
  if (!sameOrigin(req)) {
    originFailure(res);
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", clearUserSessionCookie());
  res.status(204).end();
});
