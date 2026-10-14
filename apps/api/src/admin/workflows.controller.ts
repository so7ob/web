import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Allow } from "class-validator";
import type { Request } from "express";
import { can, type AuthUser, type WorkflowScope } from "@so7ob/contracts";
import { WorkflowAdministration, AuthFault } from "@so7ob/server";
import { AccountGuard } from "../business/controller.js";
interface WorkflowRequest extends Request {
  actor: AuthUser;
}
class WorkflowBody {
  @Allow() payload?: unknown;
}
const scopeOf = (value: string): WorkflowScope => {
  if (value !== "requests" && value !== "inquiries")
    throw new AuthFault(400, "invalid");
  return value;
};
@ApiTags("Workflows")
@Controller(["api/admin/workflows", "api/v1/admin/workflows"])
@UseGuards(AccountGuard)
export class WorkflowController {
  constructor(
    @Inject(WorkflowAdministration) readonly service: WorkflowAdministration,
  ) {}
  @Get() overview(@Req() r: WorkflowRequest) {
    return this.service.overview(r.actor);
  }
  @Get("transfer/records") queue(
    @Req() r: WorkflowRequest,
    @Query("scope") scope: string,
    @Query("q") q?: string,
    @Query("page") page?: string,
  ) {
    return this.service.queue(
      r.actor,
      scopeOf(scope),
      q ?? "",
      Number(page ?? 1),
    );
  }
  @Get("options") options(
    @Req() r: WorkflowRequest,
    @Query("scope") scope: string,
    @Query("team") team?: string,
  ) {
    return this.service.options(r.actor, scopeOf(scope), team ?? null);
  }
  @Post("teams") team(@Req() r: WorkflowRequest, @Body() b: WorkflowBody) {
    return this.service.team(r.actor, b.payload);
  }
  @Post("calendars") calendar(
    @Req() r: WorkflowRequest,
    @Body() b: WorkflowBody,
  ) {
    return this.service.calendar(r.actor, b.payload);
  }
  @Post("drafts") save(@Req() r: WorkflowRequest, @Body() b: WorkflowBody) {
    return this.service.save(r.actor, b.payload);
  }
  @Post("validate") validate(
    @Req() r: WorkflowRequest,
    @Body() b: WorkflowBody,
  ) {
    return this.service.validate(r.actor, b.payload);
  }
  @Post("simulate") simulate(
    @Req() r: WorkflowRequest,
    @Body() b: WorkflowBody,
  ) {
    return this.service.simulate(r.actor, b.payload);
  }
  @Post("publish") publish(@Req() r: WorkflowRequest, @Body() b: WorkflowBody) {
    return this.service.publish(r.actor, b.payload);
  }
  @Post("transfer/preview") preview(
    @Req() r: WorkflowRequest,
    @Body() b: WorkflowBody,
  ) {
    return this.service.previewTransfer(r.actor, b.payload);
  }
  @Post("transfer/confirm") transfer(
    @Req() r: WorkflowRequest,
    @Body() b: WorkflowBody,
  ) {
    return this.service.transfer(r.actor, b.payload);
  }
  @Get(":scope/:id") async state(
    @Req() r: WorkflowRequest,
    @Param("scope") scope: string,
    @Param("id") id: string,
  ) {
    const kind = scopeOf(scope);
    if (
      !can(
        r.actor,
        kind === "requests" ? "requests.view.all" : "inquiries.view.all",
      )
    )
      throw new AuthFault(403, "forbidden");
    return {
      ok: true,
      workflow: await this.service.engine.state(r.actor, kind, id),
    };
  }
  @Post(":scope/:id/assign") assign(
    @Req() r: WorkflowRequest,
    @Param("scope") scope: string,
    @Param("id") id: string,
    @Body() b: WorkflowBody,
  ) {
    return this.service.assign(r.actor, scopeOf(scope), id, b.payload);
  }
  @Post(":scope/:id/transition") transition(
    @Req() r: WorkflowRequest,
    @Param("scope") scope: string,
    @Param("id") id: string,
    @Body() b: WorkflowBody,
  ) {
    const p = b.payload as Record<string, unknown> | null;
    if (
      !p ||
      typeof p.transitionId !== "string" ||
      typeof p.expectedRevision !== "number" ||
      !Number.isInteger(p.expectedRevision) ||
      typeof p.operationId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(p.operationId) ||
      (p.reason !== undefined &&
        (typeof p.reason !== "string" || p.reason.length > 500))
    )
      throw new AuthFault(400, "invalid");
    return this.service.engine.transition(r.actor, scopeOf(scope), id, {
      transitionId: p.transitionId,
      expectedRevision: p.expectedRevision,
      operationId: p.operationId,
      reason: p.reason as string | undefined,
    });
  }
}
