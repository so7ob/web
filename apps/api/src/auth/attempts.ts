import type { Request, Response, NextFunction } from "express";
import { AuthenticationService, AuthFault } from "@so7ob/server";
import { AuthHttpPolicy } from "./policy.js";
const permits = new WeakMap<Request, object>();
export const requestAttempt = (req: Request) => permits.get(req);
/** Runs before JSON parsing/DTO pipes: malformed and invalid input counts as in Website. */
export function authAttemptMiddleware(
  auth: AuthenticationService,
  policy: AuthHttpPolicy,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const route = /^\/api\/(?:v1\/)?auth\/(register|forgot-password)\/?$/.exec(
      req.path,
    );
    if (req.method !== "POST" || !route) return next();
    try {
      policy.origin(req);
      permits.set(
        req,
        await auth.reserveAttempt(
          route[1] === "register" ? "register" : "forgot",
          req.ip ?? "unknown",
        ),
      );
      next();
    } catch (error) {
      if (error instanceof AuthFault) {
        res.setHeader("Cache-Control", "no-store");
        if (error.status === 429)
          res.setHeader("Retry-After", String(error.extra.retryAfterSec));
        res
          .status(error.status)
          .json({ ok: false, code: error.code, ...error.extra });
      } else next(error);
    }
  };
}
