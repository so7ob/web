import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Allow, IsOptional, IsString } from "class-validator";
import type { Request, Response } from "express";
import type { AuthUser } from "@so7ob/contracts";
import {
  AdminDashboardService,
  AdminOperationsService,
  AdminConversationService,
} from "@so7ob/server";
import { AccountGuard } from "../business/controller.js";
class AdminQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() range?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() service?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() priority?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignee?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() archived?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() overdue?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
}
class OperationBody {
  @Allow() baseRevision?: unknown;
  @ApiPropertyOptional() @Allow() name?: unknown;
  @ApiPropertyOptional() @Allow() content?: unknown;
  @ApiPropertyOptional() @Allow() body?: unknown;
  @ApiPropertyOptional() @Allow() kind?: unknown;
  @ApiPropertyOptional() @Allow() assigneeId?: unknown;
  @ApiPropertyOptional() @Allow() priority?: unknown;
  @ApiPropertyOptional() @Allow() status?: unknown;
  @ApiPropertyOptional() @Allow() action?: unknown;
  @ApiPropertyOptional() @Allow() note?: unknown;
  @ApiPropertyOptional() @Allow() ids?: unknown;
  @ApiPropertyOptional() @Allow() location?: unknown;
  @ApiPropertyOptional() @Allow() items?: unknown;
}
class SettingsBody {
  @Allow() "response.hours"?: unknown;
  @Allow() "response.applyToExisting"?: unknown;
  @Allow() baseRevisions?: unknown;
  @Allow() "track.forceLogin"?: unknown;
  @Allow() "track.requestsMode"?: unknown;
  @Allow() "track.inquiriesMode"?: unknown;
  @Allow() "track.linkTtlDays"?: unknown;
  @Allow() "track.allowGuestAttachments"?: unknown;
  @Allow() "contact.email"?: unknown;
  @Allow() "contact.phone"?: unknown;
  @Allow() "contact.address"?: unknown;
  @Allow() "social.github"?: unknown;
  @Allow() "site.nameAr"?: unknown;
  @Allow() "site.nameEn"?: unknown;
  @Allow() "announcement.enabled"?: unknown;
  @Allow() "announcement.messageAr"?: unknown;
  @Allow() "announcement.messageEn"?: unknown;
  @Allow() "announcement.ctaLabelAr"?: unknown;
  @Allow() "announcement.ctaLabelEn"?: unknown;
  @Allow() "announcement.ctaUrl"?: unknown;
  @Allow() "announcement.variant"?: unknown;
  @Allow() "announcement.startAt"?: unknown;
  @Allow() "announcement.endAt"?: unknown;
}
interface AdminRequest extends Request {
  actor: AuthUser;
}
@ApiTags("Administrative operations")
@Controller(["api/admin", "api/v1/admin"])
@UseGuards(AccountGuard)
export class AdminOperationsController {
  constructor(
    @Inject(AdminDashboardService)
    private readonly dashboard: AdminDashboardService,
    @Inject(AdminOperationsService)
    private readonly ops: AdminOperationsService,
    @Inject(AdminConversationService)
    private readonly conversations: AdminConversationService,
  ) {}
  @Get("dashboard") async home(@Req() req: AdminRequest) {
    const d = await this.dashboard.dashboard(req.actor, null);
    return {
      ok: true,
      metrics: {
        totalUsers: d.access.users ? d.totalUsers : null,
        activeUsers: d.access.users ? d.activeUsers : null,
        pendingUsers: d.access.users ? d.pendingUsers : null,
        suspendedUsers: d.access.users
          ? await this.dashboard.suspended(req.actor)
          : null,
        openRequests: d.access.requests ? d.openRequests : null,
        newRequests: d.access.requests
          ? (d.statusGroups.find((g) => g.status === "new")?._count ?? 0)
          : null,
        awaitingInfo: d.access.requests ? d.awaitingInfo : null,
        openInquiries: d.access.inquiries ? d.openInquiries : null,
        publishedPages: d.access.pages ? d.publishedPages : null,
        draftPages: d.access.pages ? d.draftPages : null,
      },
      requestsByStatus: await this.dashboard.statusCounts(d),
      recentRequests: d.recentRequests,
      recentActivity: d.recentAudit.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        actor: a.actor?.name ?? a.actorEmail ?? "—",
        createdAt: a.createdAt,
      })),
      last7days: await this.dashboard.days(d),
    };
  }
  @Get("search") search(@Req() req: AdminRequest, @Query() q: AdminQuery) {
    return this.dashboard.search(req.actor, q.q);
  }
  @Get("settings") settings(@Req() req: AdminRequest) {
    return this.ops.settings(req.actor);
  }
  @Patch("settings") updateSettings(
    @Req() req: AdminRequest,
    @Body() body: SettingsBody,
  ) {
    return this.ops.updateSettings(req.actor, { ...body });
  }
  @Get("menus") menus(@Req() req: AdminRequest) {
    return this.ops.menus(req.actor);
  }
  @Put("menus") updateMenu(
    @Req() req: AdminRequest,
    @Body() body: OperationBody,
  ) {
    return this.ops.updateMenu(req.actor, { ...body });
  }
  @Get("audit") audit(@Req() req: AdminRequest, @Query() q: AdminQuery) {
    return this.ops.logs(req.actor, q);
  }
  @Put('menus/checked') checkedMenu(@Req() req:AdminRequest,@Body() body:OperationBody){return this.ops.updateMenu(req.actor,{...body},true);}
  @Patch('settings/checked') checkedSettings(@Req() req:AdminRequest,@Body() body:SettingsBody){return this.ops.updateSettings(req.actor,{...body},true);}
  @Get("outbox") outbox(@Req() req: AdminRequest, @Query() q: AdminQuery) {
    return this.ops.outbox(req.actor, q.page);
  }
  @Get("saved-replies") saved(@Req() req: AdminRequest) {
    return this.ops.savedReplies(req.actor);
  }
  @Post("saved-replies") save(
    @Req() req: AdminRequest,
    @Body() body: OperationBody,
  ) {
    return this.ops.saveReply(req.actor, { ...body });
  }
  @Patch("saved-replies/:id") updateReply(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() body: OperationBody,
  ) {
    return this.ops.saveReply(req.actor, { ...body }, id);
  }
  @Delete("saved-replies/:id") removeReply(
    @Req() req: AdminRequest,
    @Param("id") id: string,
  ) {
    return this.ops.saveReply(req.actor, {}, id, true);
  }
  @Get("requests") requests(@Req() req: AdminRequest, @Query() q: AdminQuery) {
    return this.conversations.list(req.actor, "requests", q);
  }
  @Get("inquiries") inquiries(
    @Req() req: AdminRequest,
    @Query() q: AdminQuery,
  ) {
    return this.conversations.list(req.actor, "inquiries", q);
  }
  @Post("requests/bulk") @HttpCode(200) bulkRequests(
    @Req() req: AdminRequest,
    @Body() body: OperationBody,
  ) {
    return this.conversations.bulk(req.actor, "requests", { ...body });
  }
  @Post("inquiries/bulk") @HttpCode(200) bulkInquiries(
    @Req() req: AdminRequest,
    @Body() body: OperationBody,
  ) {
    return this.conversations.bulk(req.actor, "inquiries", { ...body });
  }
  @Get("requests/export") async exportRequests(
    @Req() req: AdminRequest,
    @Query() q: AdminQuery,
    @Res() res: Response,
  ) {
    const file = await this.conversations.csv(req.actor, "requests", q);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Export-Count", String(file.count));
    res.setHeader("Content-Length", String(file.bytes));
    res.setTimeout(60000,()=>res.destroy());
    res.download(file.path, `so7ob-requests-${new Date().toISOString().slice(0,10)}.csv`, {dotfiles:"allow"}, (error) => {
      void file.dispose();
      if(error) res.destroy();
    });
  }
  @Get("inquiries/export") async exportInquiries(
    @Req() req: AdminRequest,
    @Query() q: AdminQuery,
    @Res() res: Response,
  ) {
    const file = await this.conversations.csv(req.actor, "inquiries", q);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Export-Count", String(file.count));
    res.setHeader("Content-Length", String(file.bytes));
    res.setTimeout(60000,()=>res.destroy());
    res.download(file.path, `so7ob-inquiries-${new Date().toISOString().slice(0,10)}.csv`, {dotfiles:"allow"}, (error) => {
      void file.dispose();
      if(error) res.destroy();
    });
  }
  @Get("requests/:id") request(
    @Req() req: AdminRequest,
    @Param("id") id: string,
  ) {
    return this.conversations.detail(req.actor, "requests", id);
  }
  @Get("inquiries/:id") inquiry(
    @Req() req: AdminRequest,
    @Param("id") id: string,
  ) {
    return this.conversations.detail(req.actor, "inquiries", id);
  }
  @Patch("requests/:id") patchRequest(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() body: OperationBody,
  ) {
    return this.conversations.patch(req.actor, "requests", id, { ...body });
  }
  @Patch("inquiries/:id") patchInquiry(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() body: OperationBody,
  ) {
    return this.conversations.patch(req.actor, "inquiries", id, { ...body });
  }
  @Post("inquiries/:id/messages") message(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() body: OperationBody,
  ) {
    return this.conversations.inquiryMessage(req.actor, id, { ...body });
  }
}
