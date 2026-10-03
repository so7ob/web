import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import { Allow } from "class-validator";
import type { Request, Response, NextFunction } from "express";
import type { AuthUser } from "@so7ob/contracts";
import { AuthenticationService, AuthFault, ClaimService } from "@so7ob/server";
import { AuthHttpPolicy } from "./policy.js";
import { AccountGuard } from "../business/controller.js";
const attempts = new WeakMap<Request, object>();
export function claimAttemptMiddleware(
  auth: AuthenticationService,
  claims: ClaimService,
  policy: AuthHttpPolicy,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (
      req.method !== "POST" ||
      !/^\/api\/(?:v1\/)?account\/requests\/claim\/?$/.test(req.path)
    )
      return next();
    try {
      const session = await auth.session(
        policy.cookie(req, policy.sessionCookie),
      );
      if (!session) throw new AuthFault(401, "unauthorized");
      policy.origin(req);
      attempts.set(
        req,
        await claims.reserveAttempt(session.user, req.ip ?? "unknown"),
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
class ClaimDto {
  @ApiProperty() @Allow() refCode?: unknown;
}
@ApiTags("Request ownership claims")
@Controller(["api/account", "api/v1/account"])
export class ClaimController {
  constructor(
    @Inject(ClaimService) private readonly claims: ClaimService,
    @Inject(AuthenticationService) private readonly auth: AuthenticationService,
    @Inject(AuthHttpPolicy) private readonly policy: AuthHttpPolicy,
  ) {}
  @Post("requests/claim") @HttpCode(200) @UseGuards(AccountGuard) begin(
    @Req() req: Request & { actor: AuthUser },
    @Body() body: ClaimDto,
  ) {
    return this.claims.begin(
      req.actor,
      body.refCode,
      req.ip ?? "unknown",
      attempts.get(req),
    );
  }
  @Get("claim-verify") async verify(
    @Req() req: Request,
    @Query("token") token: string | undefined,
    @Query("ref") ref: string | undefined,
    @Query("locale") locale: string | undefined,
    @Res() res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    const session = await this.auth.session(
      this.policy.cookie(req, this.policy.sessionCookie),
    );
    const uiLocale = session?.user.locale ?? (locale === "en" ? "en" : "ar");
    const base = "/" + uiLocale + "/account/requests";
    if (!session) {
      res.redirect(307, base + "?claim=login_required");
      return;
    }
    const linked = await this.claims.complete(
      session.user,
      typeof token === "string" ? token : "",
      typeof ref === "string" ? ref : "",
    );
    res.redirect(
      307,
      linked
        ? base + "?claim=ok&ref=" + encodeURIComponent(linked)
        : base + "?claim=invalid",
    );
  }
}
