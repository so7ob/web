import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { AuthUser } from "@so7ob/contracts";
import {
  AuthenticationService,
  AuthFault,
  AccountService,
  SubmissionService,
  RequestService,
  InquiryService,
} from "@so7ob/server";
import { AuthHttpPolicy } from "../auth/policy.js";
import {
  ProjectSubmissionDto,
  InquirySubmissionDto,
  ProfileDto,
  DraftDto,
  ReadNotificationDto,
  MessageDto,
  RequestPatchDto,
  PortalInquiryDto,
  ConversationQuery,
} from "./dto.js";
interface BusinessRequest extends Request {
  actor: AuthUser | null;
}
@Injectable()
export class SubmissionGuard implements CanActivate {
  constructor(
    @Inject(AuthenticationService) private readonly auth: AuthenticationService,
    @Inject(AuthHttpPolicy) private readonly policy: AuthHttpPolicy,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<BusinessRequest>();
    this.policy.mutation(req);
    req.actor =
      (
        await this.auth.session(
          this.policy.cookie(req, this.policy.sessionCookie),
        )
      )?.user ?? null;
    if (req.path.endsWith('/inquiries') && req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      req.body.name ??= req.actor?.name ?? '';
      req.body.email ??= req.actor?.email ?? '';
    }
    return true;
  }
}
@Injectable()
export class AccountGuard implements CanActivate {
  constructor(
    @Inject(AuthenticationService) private readonly auth: AuthenticationService,
    @Inject(AuthHttpPolicy) private readonly policy: AuthHttpPolicy,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<BusinessRequest>();
    req.actor =
      (
        await this.auth.session(
          this.policy.cookie(req, this.policy.sessionCookie),
        )
      )?.user ?? null;
    if (!req.actor) throw new AuthFault(401, "unauthorized");
    if (!["GET", "HEAD"].includes(req.method)) this.policy.mutation(req);
    context.switchToHttp().getResponse().setHeader("Cache-Control", "no-store");
    return true;
  }
}
@ApiTags("Public submissions")
@Controller(["api", "api/v1"])
@UseGuards(SubmissionGuard)
export class SubmissionController {
  constructor(
    @Inject(SubmissionService) private readonly service: SubmissionService,
  ) {}
  @Post("requests") request(
    @Body() body: ProjectSubmissionDto,
    @Req() req: BusinessRequest,
  ) {
    return this.service.request(
      body,
      req.actor,
      req.ip ?? "unknown",
      req.headers["user-agent"] ?? "",
    );
  }
  @Post("inquiries") inquiry(
    @Body() body: InquirySubmissionDto,
    @Req() req: BusinessRequest,
  ) {
    return this.service.inquiry(body, req.actor, req.ip ?? "unknown");
  }
}
@ApiTags("Account")
@Controller(["api/account", "api/v1/account"])
@UseGuards(AccountGuard)
export class AccountController {
  constructor(
    @Inject(AccountService) private readonly service: AccountService,
  ) {}
  @Get("profile") profile(@Req() req: BusinessRequest) {
    return this.service.profile(req.actor!);
  }
  @Patch("profile") updateProfile(
    @Req() req: BusinessRequest,
    @Body() body: ProfileDto,
  ) {
    return this.service.updateProfile(req.actor!, { ...body });
  }
  @Get("drafts") draft(@Req() req: BusinessRequest) {
    return this.service.draft(req.actor!);
  }
  @Put("drafts") saveDraft(
    @Req() req: BusinessRequest,
    @Body() body: DraftDto,
  ) {
    return this.service.saveDraft(req.actor!, { ...body });
  }
  @Delete("drafts") deleteDraft(@Req() req: BusinessRequest) {
    return this.service.deleteDraft(req.actor!);
  }
  @Get("notifications") notifications(
    @Req() req: BusinessRequest,
    @Query("page") page?: string,
    @Query("unread") unread?: string,
  ) {
    return this.service.notifications(req.actor!, { page, unread });
  }
  @Post("notifications") @HttpCode(200) readNotification(
    @Req() req: BusinessRequest,
    @Body() body: ReadNotificationDto,
  ) {
    return this.service.readNotification(req.actor!, body);
  }
}

@ApiTags("Account conversations")
@Controller(["api/account", "api/v1/account"])
@UseGuards(AccountGuard)
export class ConversationController {
  constructor(
    @Inject(RequestService) private readonly requests: RequestService,
    @Inject(InquiryService) private readonly inquiries: InquiryService,
    @Inject(SubmissionService) private readonly submissions: SubmissionService,
  ) {}
  @Get("requests") listRequests(
    @Req() req: BusinessRequest,
    @Query() query: ConversationQuery,
  ) {
    return this.requests.list(req.actor!, query);
  }
  @Get("requests/:id") request(
    @Req() req: BusinessRequest,
    @Param("id") id: string,
  ): ReturnType<RequestService["detail"]> {
    return this.requests.detail(req.actor!, id);
  }
  @Patch("requests/:id") patchRequest(
    @Req() req: BusinessRequest,
    @Param("id") id: string,
    @Body() body: RequestPatchDto,
  ) {
    return this.requests.patch(req.actor!, id, { ...body });
  }
  @Post("requests/:id/messages") requestMessage(
    @Req() req: BusinessRequest,
    @Param("id") id: string,
    @Body() body: MessageDto,
  ) {
    return this.requests.message(req.actor!, id, body, req.ip);
  }
  @Get("inquiries") listInquiries(
    @Req() req: BusinessRequest,
    @Query() query: ConversationQuery,
  ) {
    return this.inquiries.list(req.actor!, query);
  }
  @Post("inquiries") createInquiry(
    @Req() req: BusinessRequest,
    @Body() body: PortalInquiryDto,
  ) {
    return this.submissions.inquiry(body, req.actor, req.ip ?? "unknown", true);
  }
  @Get("inquiries/:id") inquiry(
    @Req() req: BusinessRequest,
    @Param("id") id: string,
  ): ReturnType<InquiryService["detail"]> {
    return this.inquiries.detail(req.actor!, id);
  }
  @Post("inquiries/:id/messages") async inquiryMessage(
    @Req() req: BusinessRequest,
    @Param("id") id: string,
    @Body() body: MessageDto,
    @Res() res: Response,
  ) {
    const sent = await this.inquiries.message(req.actor!, id, body.body);
    res.status(sent.status).json(sent.result);
  }
}
