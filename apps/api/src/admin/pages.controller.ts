import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards, } from "@nestjs/common";
import { ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Allow, IsOptional, IsString } from "class-validator";
import express, { type Request, type Response, type NextFunction, } from "express";
import { can } from "@so7ob/contracts";
import { AuthenticationService, AuthFault } from "@so7ob/server";
import { AuthHttpPolicy } from "../auth/policy.js";
import type { AuthUser } from "@so7ob/contracts";
import { PagePublicationService, PageAdministrationService } from "@so7ob/server";
import { PermissionGuard, RequiresPermission, } from "../business/permission.guard.js";
/** Authenticate/authorize before buffering large editor documents. Other JSON stays at 128 KiB. */
export function cmsBodyMiddleware(auth: AuthenticationService, policy: AuthHttpPolicy) {
    const parse = express.json({ limit: "160mb" });
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!["POST", "PATCH"].includes(req.method) ||
            !/^\/api\/(?:v1\/)?admin\/pages(?:\/|$)/.test(req.path))
            return next();
        try {
            const actor = (await auth.session(policy.cookie(req, policy.sessionCookie)))?.user;
            if (!actor)
                throw new AuthFault(401, "unauthorized");
            const permission = (req.path.endsWith("/publish") || req.path.endsWith("/schedule"))
                ? "pages.publish"
                : req.path.endsWith("/restore")
                    ? "pages.restore"
                    : "pages.edit";
            if (!can(actor, permission))
                throw new AuthFault(403, "forbidden");
            policy.mutation(req);
            parse(req, res, error => next(error?.type === "entity.too.large" ? new AuthFault(413, "payload_too_large") : error));
        }
        catch (error) {
            if (!(error instanceof AuthFault))
                return next(error);
            res.setHeader("Cache-Control", "no-store");
            res
                .status(error.status)
                .json({ ok: false, code: error.code, ...error.extra });
        }
    };
}
interface CmsRequest extends Request {
    actor: AuthUser;
}
class PageQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    q?: string;
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    status?: string;
}
// Preserve Website's permissive metadata coercion/ignored non-string patch fields.
// The service validates slugs and every supplied JSON block against the shared 27 Zod schemas.
class PageCreateDto {
    @ApiPropertyOptional({ type: String })
    @Allow()
    slug?: unknown;
    @ApiPropertyOptional({ type: String })
    @Allow()
    titleAr?: unknown;
    @ApiPropertyOptional({ type: String })
    @Allow()
    titleEn?: unknown;
    @ApiPropertyOptional({ enum: ["empty", "blank-section"] })
    @Allow()
    template?: unknown;
}
class PublicationDto {
    @ApiPropertyOptional({ type: Number })
    @Allow()
    baseRevision?: unknown;
    @ApiPropertyOptional({ type: [String], enum: ["ar", "en"] })
    @Allow()
    locales?: unknown;
    @ApiPropertyOptional({ enum: ["ar", "en"] })
    @Allow()
    locale?: unknown;
    @ApiPropertyOptional({ type: String, nullable: true })
    @Allow()
    publishAt?: unknown;
}
class PagePatchDto extends PageCreateDto {
    @ApiPropertyOptional({ type: Object })
    @Allow()
    draftSettings?: unknown;
    @ApiPropertyOptional({ type: Number, description: "Required base revision for v1 tree writes" })
    @Allow()
    baseRevision?: unknown;
    @ApiPropertyOptional({
        type: String,
        description: "ISO timestamp returned by the latest draft; stale values produce 409",
    })
    @Allow()
    draftUpdatedAt?: unknown;
    @ApiPropertyOptional({
        type: String,
        description: "JSON string validated against the original block schemas",
    })
    @Allow()
    draftBlocksAr?: unknown;
    @ApiPropertyOptional({ type: String })
    @Allow()
    draftBlocksEn?: unknown;
    @ApiPropertyOptional({ type: String })
    @Allow()
    seoTitleAr?: unknown;
    @ApiPropertyOptional({ type: String })
    @Allow()
    seoTitleEn?: unknown;
    @ApiPropertyOptional({ type: String })
    @Allow()
    seoDescAr?: unknown;
    @ApiPropertyOptional({ type: String })
    @Allow()
    seoDescEn?: unknown;
    @ApiPropertyOptional({ type: Number })
    @Allow()
    order?: unknown;
    @ApiPropertyOptional({ enum: ["public", "authenticated", "role"] })
    @Allow()
    visibility?: unknown;
    @ApiPropertyOptional({ type: [String] })
    @Allow()
    allowedRoles?: unknown;
    @ApiPropertyOptional({ type: Boolean })
    @Allow()
    isHome?: unknown;
}
@ApiTags("Page administration")
@Controller(["api/admin/pages", "api/v1/admin/pages"])
@UseGuards(PermissionGuard)
export class PageAdministrationController {
    constructor(
    @Inject(PageAdministrationService)
    private readonly pages: PageAdministrationService,
    @Inject(PagePublicationService)
    private readonly publication: PagePublicationService) { }
    @Get()
    @RequiresPermission("pages.view")
    list(
    @Req()
    req: CmsRequest,
    @Query()
    query: PageQueryDto) {
        return this.pages.list(req.actor, query);
    }
    @Post()
    @RequiresPermission("pages.edit")
    create(
    @Req()
    req: CmsRequest,
    @Body()
    body: PageCreateDto) {
        return this.pages.create(req.actor, { ...body });
    }
    @Get(":id")
    @RequiresPermission("pages.view")
    detail(
    @Req()
    req: CmsRequest,
    @Param("id")
    id: string) {
        return this.pages.detail(req.actor, id);
    }
    @Patch(":id")
    @RequiresPermission("pages.edit")
    update(
    @Req()
    req: CmsRequest,
    @Param("id")
    id: string,
    @Body()
    body: PagePatchDto) {
        return this.pages.update(req.actor, id, { ...body });
    }
    @Delete(":id")
    @RequiresPermission("pages.delete")
    archive(
    @Req()
    req: CmsRequest,
    @Param("id")
    id: string) {
        return this.pages.archive(req.actor, id);
    }
    @Post(":id/publish")
    @HttpCode(200)
    @RequiresPermission("pages.publish")
    publish(
    @Req()
    req: CmsRequest,
    @Param("id")
    id: string,
    @Body()
    body: PublicationDto) {
        // Empty-body adapter for the original editor; explicit revision uses the refreshed contract.
        return Object.values(body ?? {}).some(value => value !== undefined) ? this.publication.publish(req.actor, id, { ...body }) : this.pages.publish(req.actor, id);
    }
    @Post(":id/discard")
    @HttpCode(200)
    @RequiresPermission("pages.edit")
    discard(
    @Req()
    req: CmsRequest,
    @Param("id")
    id: string,
    @Body()
    body: PublicationDto) { return this.publication.discard(req.actor, id, { ...body }); }
    @Post(":id/schedule")
    @HttpCode(200)
    @RequiresPermission("pages.publish")
    schedule(
    @Req()
    req: CmsRequest,
    @Param("id")
    id: string,
    @Body()
    body: PublicationDto) { return this.publication.schedule(req.actor, id, { ...body }); }
    @Get(":id/versions")
    @RequiresPermission("pages.view")
    versions(
    @Req()
    req: CmsRequest,
    @Param("id")
    id: string) {
        return this.pages.versions(req.actor, id);
    }
    @Post(":id/versions/:version/restore")
    @HttpCode(200)
    @RequiresPermission("pages.restore")
    restore(
    @Req()
    req: CmsRequest,
    @Param("id")
    id: string,
    @Param("version")
    version: string,
    @Body()
    body: PublicationDto) {
        return Object.values(body ?? {}).some(value => value !== undefined) ? this.publication.restore(req.actor, id, version, { ...body }) : this.pages.restore(req.actor, id, version);
    }
}
