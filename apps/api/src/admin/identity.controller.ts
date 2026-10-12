import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Allow } from "class-validator";
import type { Request, Response, NextFunction } from "express";
import type { AuthUser } from "@so7ob/contracts";
import { can } from "@so7ob/contracts";
import {
  AuthenticationService,
  AuthFault,
  IdentityAdministrationService,
} from "@so7ob/server";
import {
  PermissionGuard,
  RequiresPermission,
} from "../business/permission.guard.js";
import { AuthHttpPolicy } from "../auth/policy.js";
interface IdentityRequest extends Request {
  actor: AuthUser;
}
class RoleDto {
  @Allow() key?: unknown;
  @Allow() nameAr?: unknown;
  @Allow() nameEn?: unknown;
  @Allow() descriptionAr?: unknown;
  @Allow() descriptionEn?: unknown;
  @Allow() permissions?: unknown;
  @Allow() grantablePermissions?: unknown;
  @Allow() version?: unknown;
  @Allow() status?: unknown;
  @Allow() copyFrom?: unknown;
}
class OperationDto {
  @Allow() reason?: unknown;
  @Allow() currentPassword?: unknown;
  @Allow() sessionId?: unknown;
}
@Controller(["api/admin/identity", "api/v1/admin/identity"])
@UseGuards(PermissionGuard)
export class IdentityAdministrationController {
  constructor(
    @Inject(IdentityAdministrationService)
    private readonly service: IdentityAdministrationService,
  ) {}
  @Get("roles") @RequiresPermission("roles.view") roles(
    @Req() req: IdentityRequest,
    @Query("q") q?: string,
    @Query("page") page?: string,
  ) {
    return this.service.roles(req.actor, { q, page });
  }
  @Get("role-options") @RequiresPermission("pages.edit") options(
    @Req() req: IdentityRequest,
    @Query("q") q?: string,
    @Query("page") page?: string,
  ) {
    return this.service.roles(req.actor, { q, page }, true);
  }
  @Get("roles/:key") @RequiresPermission("roles.view") role(
    @Req() req: IdentityRequest,
    @Param("key") key: string,
    @Query("page") page?: string,
  ) {
    return this.service.roleDetail(
      req.actor,
      key,
      Number.parseInt(page ?? "1") || 1,
    );
  }
  @Post("roles") @RequiresPermission("roles.create") create(
    @Req() req: IdentityRequest,
    @Body() body: RoleDto,
  ) {
    return this.service.saveRole(req.actor, undefined, { ...body });
  }
  @Patch("roles/:key") @RequiresPermission("roles.update") update(
    @Req() req: IdentityRequest,
    @Param("key") key: string,
    @Body() body: RoleDto,
  ) {
    return this.service.saveRole(req.actor, key, { ...body });
  }
  @Get("catalog") @RequiresPermission("roles.view") catalog(
    @Req() req: IdentityRequest,
  ) {
    return this.service.catalog(req.actor);
  }
  @Get("invitations") @RequiresPermission("invitations.manage") invitations(
    @Req() req: IdentityRequest,
    @Query("page") page?: string,
  ) {
    return this.service.invitations(
      req.actor,
      Number.parseInt(page ?? "1") || 1,
    );
  }
  @Post("invitations/:id/:operation")
  @RequiresPermission("invitations.manage")
  invitation(
    @Req() req: IdentityRequest,
    @Param("id") id: string,
    @Param("operation") operation: string,
    @Body() body: OperationDto,
  ) {
    return this.service.invitation(req.actor, id, operation, { ...body });
  }
  @Get("users/:id/sessions")
  @RequiresPermission("users.sessions.manage")
  sessions(@Req() req: IdentityRequest, @Param("id") id: string) {
    return this.service.sessions(req.actor, id);
  }
  @Post("users/:id/temporary")
  @RequiresPermission("users.credentials.temporary")
  temporary(
    @Req() req: IdentityRequest,
    @Param("id") id: string,
    @Body() body: OperationDto,
  ) {
    return this.service.userOperation(req.actor, id, "temporary", { ...body });
  }
  @Post("users/:id/setup") @RequiresPermission("users.credentials.reset") setup(
    @Req() req: IdentityRequest,
    @Param("id") id: string,
    @Body() body: OperationDto,
  ) {
    return this.service.userOperation(req.actor, id, "setup", { ...body });
  }
  @Post("users/:id/revoke") @RequiresPermission("users.sessions.manage") revoke(
    @Req() req: IdentityRequest,
    @Param("id") id: string,
    @Body() body: OperationDto,
  ) {
    return this.service.userOperation(req.actor, id, "revoke", { ...body });
  }
}
// Admission precedes parsing for both aliases, sharing actor quotas across endpoints.
export function identityAttemptMiddleware(
  auth: AuthenticationService,
  service: IdentityAdministrationService,
  policy: AuthHttpPolicy,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (
      !["POST", "PATCH"].includes(req.method) ||
      !/^\/api\/(?:v1\/)?admin\/(?:identity(?:\/|$)|users\/direct\/?$)/.test(
        req.path,
      )
    )
      return next();
    try {
      const actor = (
        await auth.session(policy.cookie(req, policy.sessionCookie))
      )?.user;
      if (!actor) throw new AuthFault(401, "unauthorized");
      if (actor.credentialState && actor.credentialState !== "ready")
        throw new AuthFault(403, "password_change_required");
      if (!can(actor, "admin.dashboard")) throw new AuthFault(403, "forbidden");
      policy.mutation(req);
      await service.reserve(actor);
      res.setHeader("Cache-Control", "no-store");
      next();
    } catch (error) {
      if (!(error instanceof AuthFault)) return next(error);
      res.setHeader("Cache-Control", "no-store");
      if (error.status === 429)
        res.setHeader("Retry-After", String(error.extra.retryAfterSec));
      res
        .status(error.status)
        .json({ ok: false, code: error.code, ...error.extra });
    }
  };
}

export function restrictedCredentialMiddleware(
  auth: AuthenticationService,
  policy: AuthHttpPolicy,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (
      !req.path.startsWith("/api/") ||
      /^\/api\/(?:v1\/)?(?:auth\/(?:csrf|session|signout|login|callback\/credentials|change-password)|public\/view|health(?:\/[^/]+)?)\/?$/.test(
        req.path,
      )
    )
      return next();
    try {
      const actor = (
        await auth.session(policy.cookie(req, policy.sessionCookie))
      )?.user;
      if (actor?.credentialState && actor.credentialState !== "ready") {
        res.setHeader("Cache-Control", "no-store");
        res.status(403).json({ ok: false, code: "password_change_required" });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
