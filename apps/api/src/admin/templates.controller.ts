import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import express, { type Request, type Response, type NextFunction } from 'express';
import { can, type AuthUser } from '@so7ob/contracts';
import { AuthenticationService, AuthFault, PageTemplateService } from '@so7ob/server';
import { AuthHttpPolicy } from '../auth/policy.js';
import { PermissionGuard, RequiresPermission } from '../business/permission.guard.js';
interface TemplateRequest extends Request {
    actor: AuthUser;
}
class TemplateMetadataDto {
    @ApiPropertyOptional({ type: String, maxLength: 120 })
    @Allow()
    nameAr?: unknown;
    @ApiPropertyOptional({ type: String, maxLength: 120 })
    @Allow()
    nameEn?: unknown;
    @ApiPropertyOptional({ type: String, maxLength: 400 })
    @Allow()
    descAr?: unknown;
    @ApiPropertyOptional({ type: String, maxLength: 400 })
    @Allow()
    descEn?: unknown;
}
class CreateTemplateDto extends TemplateMetadataDto {
    @ApiPropertyOptional({ type: String, description: 'JSON content; maximum 300000 UTF-8 bytes before normalization' })
    @Allow()
    blocksAr?: unknown;
    @ApiPropertyOptional({ type: String, description: 'JSON content; maximum 300000 UTF-8 bytes before normalization' })
    @Allow()
    blocksEn?: unknown;
}
class ApplyTemplateDto {
    @ApiPropertyOptional({ type: String })
    @Allow()
    pageId?: unknown;
    @ApiPropertyOptional({ enum: ['ar', 'en'] })
    @Allow()
    locale?: unknown;
    @ApiPropertyOptional({ type: Number, description: 'Required current draft revision; missing/stale revision returns 409' })
    @Allow()
    baseRevision?: unknown;
}
/** Account, permission and Origin/CSRF precede larger body allocation. Two escaped 300k JSON strings fit in 4MiB. */
export function templateBodyMiddleware(auth: AuthenticationService, policy: AuthHttpPolicy) {
    const parse = express.json({ limit: '4mb' });
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!['POST', 'PATCH'].includes(req.method) || !/^\/api\/(?:v1\/)?admin\/templates(?:\/|$)/.test(req.path))
            return next();
        try {
            const actor = (await auth.session(policy.cookie(req, policy.sessionCookie)))?.user;
            if (!actor)
                throw new AuthFault(401, 'unauthorized');
            if (!can(actor, 'pages.edit'))
                throw new AuthFault(403, 'forbidden');
            policy.mutation(req);
            parse(req, res, (error?: unknown) => {
                if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large')
                    return next(new AuthFault(413, 'payload_too_large'));
                next(error);
            });
        }
        catch (error) {
            if (!(error instanceof AuthFault))
                return next(error);
            res.setHeader('Cache-Control', 'no-store');
            res.status(error.status).json({ ok: false, code: error.code, ...error.extra });
        }
    };
}
@ApiTags('Page templates')
@Controller(['api/admin/templates', 'api/v1/admin/templates'])
@UseGuards(PermissionGuard)
export class PageTemplateController {
    constructor(
    @Inject(PageTemplateService)
    private readonly templates: PageTemplateService) { }
    @Get()
    @RequiresPermission('pages.view')
    list(
    @Req()
    req: TemplateRequest) { return this.templates.list(req.actor); }
    @Post()
    @RequiresPermission('pages.edit')
    create(
    @Req()
    req: TemplateRequest, 
    @Body()
    body: CreateTemplateDto) { return this.templates.create(req.actor, { ...body }); }
    @Patch(':id')
    @RequiresPermission('pages.edit')
    update(
    @Req()
    req: TemplateRequest, 
    @Param('id')
    id: string, 
    @Body()
    body: TemplateMetadataDto) { return this.templates.update(req.actor, id, { ...body }); }
    @Delete(':id')
    @RequiresPermission('pages.edit')
    remove(
    @Req()
    req: TemplateRequest, 
    @Param('id')
    id: string) { return this.templates.remove(req.actor, id); }
    @Post(':id/apply')
    @HttpCode(200)
    @RequiresPermission('pages.edit')
    apply(
    @Req()
    req: TemplateRequest, 
    @Param('id')
    id: string, 
    @Body()
    body: ApplyTemplateDto) { return this.templates.apply(req.actor, id, { ...body }); }
}
