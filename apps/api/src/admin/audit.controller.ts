import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Header,
} from "@nestjs/common";
import { Allow } from "class-validator";
import type { Response } from "express";
import type { AuthUser } from "@so7ob/contracts";
import {
  AuditReader,
  AuditReviews,
  AuditReports,
  AuditOperations,
  AuthFault,
} from "@so7ob/server";
import {
  PermissionGuard,
  RequiresPermission,
} from "../business/permission.guard.js";
class PayloadDto {
  @Allow() payload!: unknown;
}
interface AuditRequest {
  actor: AuthUser;
}
@Controller(["api/v1/admin/audit", "api/admin/audit"])
@UseGuards(PermissionGuard)
@RequiresPermission("audit.view")
export class AuditController {
  constructor(
    @Inject(AuditReader) private readonly reader: AuditReader,
    @Inject(AuditReviews) private readonly reviews: AuditReviews,
    @Inject(AuditReports) private readonly reports: AuditReports,
    @Inject(AuditOperations) private readonly operations: AuditOperations,
  ) {}
  @Post("events/search") @Header("Cache-Control", "private, no-store") search(
    @Req() r: AuditRequest,
    @Body() body: PayloadDto,
  ) {
    return this.reader.search(r.actor, body.payload);
  }
  @Get("events/:id") @Header("Cache-Control", "private, no-store") detail(
    @Req() r: AuditRequest,
    @Param("id") id: string,
  ) {
    return this.reader.detail(r.actor, id);
  }
  @Get("events/:id/related")
  @Header("Cache-Control", "private, no-store")
  related(
    @Req() r: AuditRequest,
    @Param("id") id: string,
    @Query("kind") kind: string,
    @Query("cursor") cursor?: string,
  ) {
    if (!["resource", "batch", "correlation"].includes(kind))
      throw new AuthFault(400, "invalid");
    return this.reader.related(r.actor, id, kind as "resource", cursor);
  }
  @Post("access") access(@Req() r: AuditRequest, @Body() body: PayloadDto) {
    const p = body.payload as { eventId?: unknown } | undefined;
    if (p?.eventId !== undefined && typeof p.eventId !== "string")
      throw new AuthFault(400, "invalid");
    return this.reader.access(r.actor, p?.eventId as string | undefined);
  }
  @Get("preferences") preferences(@Req() r: AuditRequest) {
    return this.reviews.preferences(r.actor);
  }
  @Post("preferences") savePreferences(
    @Req() r: AuditRequest,
    @Body() body: PayloadDto,
  ) {
    return this.reviews.savePreferences(r.actor, body.payload);
  }
  @Get("views") views(@Req() r: AuditRequest) {
    return this.reviews.views(r.actor);
  }
  @Post("views") saveView(@Req() r: AuditRequest, @Body() body: PayloadDto) {
    return this.reviews.saveView(r.actor, body.payload);
  }
  @Delete("views/:id") deleteView(
    @Req() r: AuditRequest,
    @Param("id") id: string,
  ) {
    return this.reviews.deleteView(r.actor, id);
  }
  @Get("bookmarks") bookmarks(@Req() r: AuditRequest) {
    return this.reviews.bookmarks(r.actor);
  }
  @Post("events/:id/bookmark") bookmark(
    @Req() r: AuditRequest,
    @Param("id") id: string,
    @Body() body: PayloadDto,
  ) {
    if (typeof body.payload !== "boolean") throw new AuthFault(400, "invalid");
    return this.reviews.bookmark(r.actor, id, body.payload);
  }
  @Get("cases") cases(@Req() r: AuditRequest) {
    return this.reviews.cases(r.actor);
  }
  @Get("assignees") assignees(@Req() r: AuditRequest) {
    return this.reviews.assignees(r.actor);
  }
  @Post("cases") createCase(@Req() r: AuditRequest, @Body() body: PayloadDto) {
    return this.reviews.createCase(r.actor, body.payload);
  }
  @Get("cases/:id") caseDetail(
    @Req() r: AuditRequest,
    @Param("id") id: string,
  ) {
    return this.reviews.caseDetail(r.actor, id);
  }
  @Patch("cases/:id") updateCase(
    @Req() r: AuditRequest,
    @Param("id") id: string,
    @Body() body: PayloadDto,
  ) {
    return this.reviews.updateCase(r.actor, id, body.payload);
  }
  @Post("reports") createReport(
    @Req() r: AuditRequest,
    @Body() body: PayloadDto,
  ) {
    return this.reports.create(r.actor, body.payload);
  }
  @Get("reports") reportsList(@Req() r: AuditRequest) {
    return this.reports.list(r.actor);
  }
  @Post("reports/:id/cancel") cancel(
    @Req() r: AuditRequest,
    @Param("id") id: string,
  ) {
    return this.reports.cancel(r.actor, id);
  }
  @Get("reports/:id/download") async download(
    @Req() r: AuditRequest,
    @Param("id") id: string,
    @Query("manifest") manifest: string,
    @Res() res: Response,
  ) {
    const report = await this.reports.download(r.actor, id, manifest === "1");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (report.format === "html")
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; sandbox allow-modals",
      );
    res.download(report.path, `audit-${id}.${report.format}`);
  }
  @Get("rules") rules(@Req() r: AuditRequest) {
    return this.operations.rules(r.actor);
  }
  @Patch("rules/:id") updateRule(
    @Req() r: AuditRequest,
    @Param("id") id: string,
    @Body() body: PayloadDto,
  ) {
    return this.operations.updateRule(r.actor, id, body.payload);
  }
  @Post("rules/:id/simulate") simulate(
    @Req() r: AuditRequest,
    @Param("id") id: string,
    @Body() body: PayloadDto,
  ) {
    return this.operations.simulate(r.actor, id, body.payload);
  }
  @Get("alerts") alerts(@Req() r: AuditRequest) {
    return this.operations.alerts(r.actor);
  }
  @Get("alerts/:id/events") alertEvents(
    @Req() r: AuditRequest,
    @Param("id") id: string,
  ) {
    return this.operations.alertEvents(r.actor, id);
  }
  @Get("health") health(@Req() r: AuditRequest) {
    return this.operations.health(r.actor);
  }
  @Get("policy") policy(@Req() r: AuditRequest) {
    return this.operations.policy(r.actor);
  }
  @Patch("policy") updatePolicy(
    @Req() r: AuditRequest,
    @Body() body: PayloadDto,
  ) {
    return this.operations.updatePolicy(r.actor, body.payload);
  }
  @Post("policy/dry-run") dryRun(@Req() r: AuditRequest) {
    return this.operations.retention(r.actor);
  }
}
