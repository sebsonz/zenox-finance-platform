import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import {
  SupabaseTokenVerificationError,
  verifySupabaseAccessToken,
  type SupabaseAuthUser,
} from "../modules/user-auth/services/supabase-user-verifier.service.js";

declare global {
  namespace Express {
    interface Request {
      financeUser?: {
        id: string;
        issuer: string;
        email?: string;
      };
    }
  }
}

export function requireUserAuth() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      res.status(503).json({
        error: { code: "USER_AUTH_NOT_CONFIGURED", message: "User authentication is not configured." },
      });
      return;
    }

    const authorization = req.header("authorization");
    const match = authorization?.match(/^Bearer ([A-Za-z0-9._~-]{20,4096})$/);
    if (!match?.[1]) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." },
      });
      return;
    }

    try {
      const user: SupabaseAuthUser = await verifySupabaseAccessToken({
        supabaseUrl: env.SUPABASE_URL,
        anonKey: env.SUPABASE_ANON_KEY,
        accessToken: match[1],
      });
      req.financeUser = {
        id: user.id,
        issuer: new URL(env.SUPABASE_URL).origin,
        ...(user.email === undefined ? {} : { email: user.email }),
      };
      next();
    } catch (error) {
      if (error instanceof SupabaseTokenVerificationError) {
        const status = error.code === "INVALID_TOKEN" ? 401 : 503;
        res.status(status).json({
          error: {
            code: error.code,
            message: status === 401
              ? "The user access token is invalid or expired."
              : "User authentication is temporarily unavailable.",
          },
        });
        return;
      }
      next(error);
    }
  };
}
