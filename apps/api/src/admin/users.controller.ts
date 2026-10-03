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
  UseFilters,
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { ApiPropertyOptional, ApiTags, ApiResponse } from "@nestjs/swagger";
import { Allow, IsIn, IsOptional, IsString, Matches } from "class-validator";
import { Transform } from "class-transformer";
import type { Request, Response, NextFunction } from "express";
import { can, ROLE_KEYS, type AuthUser } from "@so7ob/contracts";
import {
  AuthenticationService,
  AuthFault,
  UserAdministrationService,
} from "@so7ob/server";
import {
  PermissionGuard,
  RequiresPermission,
} from "../business/permission.guard.js";
import { AuthHttpPolicy } from "../auth/policy.js";
interface AdminRequest extends Request {
  actor: AuthUser;
}
@Catch(AuthFault)
class UserContractErrors implements ExceptionFilter {
  catch(error: AuthFault, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error.status === 429)
      response.setHeader("Retry-After", String(error.extra.retryAfterSec));
    response
      .status(error.status)
      .json({
        ok: false,
        code: error.code,
        ...(error.code === "invalid" ? {} : error.extra),
      });
  }
}
const permits = new WeakMap<Request, object>();
export function invitationAttemptMiddleware(
  auth: AuthenticationService,
  users: UserAdministrationService,
  policy: AuthHttpPolicy,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (
      req.method !== "POST" ||
      !/^\/api\/(?:v1\/)?admin\/users\/?$/.test(req.path)
    )
      return next();
    try {
      const actor = (
        await auth.session(policy.cookie(req, policy.sessionCookie))
      )?.user;
      if (!actor) throw new AuthFault(401, "unauthorized");
      if (!can(actor, "users.create")) throw new AuthFault(403, "forbidden");
      policy.mutation(req);
      permits.set(req, await users.reserveInvitation(actor));
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
class UserQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sort?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dir?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
}
class InviteDto {
  @ApiPropertyOptional()
  @Transform(({ value }) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 200),
  )
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/)
  email = "";
  @ApiPropertyOptional({ enum: ROLE_KEYS, default: "client" })
  @Transform(({ value }) => String(value ?? "client"))
  @IsIn(ROLE_KEYS)
  roleKey = "client";
  // Website accepted this field but never persisted it; name is entered on acceptance.
  @ApiPropertyOptional() @Allow() name?: unknown;
}
class UserPatchDto {
  @ApiPropertyOptional() @Allow() name?: unknown;
  @ApiPropertyOptional() @Allow() phone?: unknown;
  @ApiPropertyOptional() @Allow() company?: unknown;
  @ApiPropertyOptional() @Allow() roleKey?: unknown;
  @ApiPropertyOptional() @Allow() status?: unknown;
}
@ApiTags("User administration")
@ApiResponse({ status: 401, description: "No active server session" })
@ApiResponse({
  status: 403,
  description: "Operation permission or CSRF denied",
})
@Controller(["api/admin/users", "api/v1/admin/users"])
@UseGuards(PermissionGuard)
@UseFilters(UserContractErrors)
export class UserAdministrationController {
  constructor(
    @Inject(UserAdministrationService)
    private readonly users: UserAdministrationService,
  ) {}
  @Get() @RequiresPermission("users.view") list(
    @Req() req: AdminRequest,
    @Query() query: UserQuery,
  ) {
    return this.users.list(req.actor, query);
  }
  @Get(":id")
  @RequiresPermission("users.view")
  @ApiResponse({ status: 404, description: "User not found" })
  detail(@Req() req: AdminRequest, @Param("id") id: string) {
    return this.users.detail(req.actor, id);
  }
  @Patch(":id")
  @RequiresPermission("users.update")
  @ApiResponse({
    status: 409,
    description: "Last active system administrator must remain active",
  })
  update(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() body: UserPatchDto,
  ) {
    return this.users.update(req.actor, id, { ...body });
  }
  @Post()
  @RequiresPermission("users.create")
  @ApiResponse({
    status: 201,
    description: "Invitation persisted and email queued, not yet sent",
  })
  @ApiResponse({
    status: 409,
    description: "Existing account or pending invitation",
  })
  @ApiResponse({
    status: 429,
    description: "Invitation rate exceeded; Retry-After is returned",
  })
  invite(@Req() req: AdminRequest, @Body() body: InviteDto) {
    return this.users.invite(
      req.actor,
      { ...body },
      req.ip ?? "unknown",
      permits.get(req),
    );
  }
}
