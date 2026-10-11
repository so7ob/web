import {Body,Controller,Get,Inject,Param,Patch,Query,Req,UseGuards} from '@nestjs/common';
import {IsOptional,IsString} from 'class-validator';
import {DiagnosticAdministration} from '@so7ob/server';
import type {AuthUser} from '@so7ob/contracts';
import {PermissionGuard,RequiresPermission} from '../business/permission.guard.js';
import {diagnostics} from '../diagnostics.js';
class QueryDto {
 @IsOptional() @IsString() q?:string;
 @IsOptional() @IsString() from?:string;
 @IsOptional() @IsString() to?:string;
 @IsOptional() @IsString() level?:string;
 @IsOptional() @IsString() component?:string;
 @IsOptional() @IsString() operation?:string;
 @IsOptional() @IsString() code?:string;
 @IsOptional() @IsString() page?:string;
}
class ReviewDto {@IsString() state!:string;}
@Controller(['api/admin/diagnostics','api/v1/admin/diagnostics'])
@UseGuards(PermissionGuard)
@RequiresPermission('diagnostics.view')
export class DiagnosticController {
 constructor(@Inject(DiagnosticAdministration) private readonly service:DiagnosticAdministration){}
 @Get() async list(@Req() req:{actor:AuthUser},@Query() q:QueryDto){return {...await this.service.list(req.actor,q),processLoss:{persistence:diagnostics.lostPersistenceCount,fallback:diagnostics.lostFallbackCount}};}
 // Export only this explicitly bounded page, using the same permission and projection.
 @Get('export') async export(@Req() req:{actor:AuthUser},@Query() q:QueryDto){return {...await this.service.list(req.actor,q),exportScope:'current_page'};}
 @Patch(':fingerprint') @RequiresPermission('diagnostics.manage') review(@Req() req:{actor:AuthUser},@Param('fingerprint') id:string,@Body() body:ReviewDto){return this.service.review(req.actor,id,body.state);}
}
