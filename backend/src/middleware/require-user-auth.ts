import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import {
  SupabaseTokenVerificationError,
  verifySupabaseAccessToken,
  type SupabaseAuthUser,
} from "../modules/user-auth/services/supabase-user-verifier.service.js";

export const USER_SESSION_COOKIE = "zenox_finance_session";

declare global {
  namespace Express {
    interface Request {
      financeUser?: {
        id: string;
        issuer: string;
        email?: string;
        emailConfirmedAt?: string | null;
      };
    }
  }
}

function readSessionCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== USER_SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9._~-]{20,4096}$/.test(value) ? value : undefined;
  }
  return undefined;
}

export async function verifyRequestUser(accessToken: string): Promise<SupabaseAuthUser> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new SupabaseTokenVerificationError("User authentication is not configured", "INVALID_CONFIGURATION");
  }
  return verifySupabaseAccessToken({
    supabaseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    accessToken,
  });
}

export function userSessionCookie(accessToken: string): string {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  return `${USER_SESSION_COOKIE}=${accessToken}; Path=/api/v1/user; Max-Age=3600; HttpOnly; SameSite=Lax${secure}`;
}

export function clearUserSessionCookie(): string {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  return `${USER_SESSION_COOKIE}=; Path=/api/v1/user; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
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
    const bearer = authorization?.match(/^Bearer ([A-Za-z0-9._~-]{20,4096})$/)?.[1];
    const accessToken = bearer ?? readSessionCookie(req.header("cookie"));
    if (!accessToken) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "A valid user session is required." },
      });
      return;
    }

    try {
      const user: SupabaseAuthUser = await verifyRequestUser(accessToken);
      req.financeUser = {
        id: user.id,
        issuer: new URL(env.SUPABASE_URL).origin,
        ...(user.email === undefined ? {} : { email: user.email }),
        ...(user.emailConfirmedAt === undefined ? {} : { emailConfirmedAt: user.emailConfirmedAt }),
      };
      next();
    } catch (error) {
      if (error instanceof SupabaseTokenVerificationError) {
        const status = error.code === "INVALID_TOKEN" ? 401 : error.code === "INVALID_CONFIGURATION" ? 503 : 503;
        res.status(status).json({
          error: {
            code: error.code === "INVALID_TOKEN" ? "INVALID_TOKEN" : error.code === "INVALID_CONFIGURATION" ? "USER_AUTH_NOT_CONFIGURED" : "AUTH_PROVIDER_UNAVAILABLE",
            message: status === 401 ? "The user session is invalid or expired." : "User authentication is temporarily unavailable.",
          },
        });
        return;
      }
      next(error);
    }
  };
}
