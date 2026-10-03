import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  type ExceptionFilter,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import { Allow } from "class-validator";
import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";
import type { AuthUser } from "@so7ob/contracts";
import {
  AuthenticationService,
  AuthFault,
  FileService,
  MAX_ATTACHMENT_SIZE,
  MAX_MEDIA_SIZE,
} from "@so7ob/server";
import { AuthHttpPolicy } from "../auth/policy.js";
import { AccountGuard } from "../business/controller.js";
import {
  PermissionGuard,
  RequiresPermission,
} from "../business/permission.guard.js";
interface FileRequest extends Request {
  actor: AuthUser;
}
interface MultipartFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}
class MediaPatchDto {
  @ApiPropertyOptional() @Allow() altText?: unknown;
  @ApiPropertyOptional() @Allow() title?: unknown;
}
@Catch(HttpException)
class UploadErrors implements ExceptionFilter {
  catch(error: HttpException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res
      .status(error.getStatus() === 413 ? 400 : error.getStatus())
      .json({
        ok: false,
        code: error.getStatus() === 413 ? "too_large" : "invalid",
      });
  }
}
const limits = (fileSize: number) => ({
  fileSize,
  files: 1,
  fields: 16,
  fieldSize: 128 * 1024,
  parts: 18,
});
const asFile = (file: MultipartFile) =>
  new File([new Uint8Array(file.buffer)], file.originalname, {
    type: file.mimetype,
  });
@ApiTags("Files")
@Controller(["api", "api/v1"])
export class FileController {
  constructor(
    @Inject(FileService) private readonly files: FileService,
    @Inject(AuthenticationService) private readonly auth: AuthenticationService,
    @Inject(AuthHttpPolicy) private readonly policy: AuthHttpPolicy,
  ) {}
  @Post("attachments")
  @UseGuards(AccountGuard)
  @UseInterceptors(
    FileInterceptor("file", { limits: limits(MAX_ATTACHMENT_SIZE) }),
  )
  @UseFilters(UploadErrors)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "requestId"],
      properties: {
        file: { type: "string", format: "binary" },
        requestId: { type: "string" },
      },
    },
  })
  upload(
    @Req() req: FileRequest,
    @UploadedFile() file: MultipartFile | undefined,
    @Body("requestId") requestId: unknown,
  ) {
    if (!file || !requestId) throw new AuthFault(400, "invalid");
    return this.files.uploadAttachment(
      req.actor,
      String(requestId),
      asFile(file),
    );
  }
  @Get("attachments/:id") async attachment(
    @Req() req: Request,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    if (!/^[a-zA-Z0-9]{1,40}$/.test(id)) {
      res.status(404).send("Not found");
      return;
    }
    const session = await this.auth.session(
      this.policy.cookie(req, this.policy.sessionCookie),
    );
    if (!session) {
      res.status(401).send("Unauthorized");
      return;
    }
    await this.download(
      res,
      () => this.files.attachment(session.user, id),
      false,
    );
  }
  @Get("media/:id") async media(@Param("id") id: string, @Res() res: Response) {
    if (!/^[a-zA-Z0-9]{1,40}$/.test(id)) {
      res.status(404).send("Not found");
      return;
    }
    await this.download(res, () => this.files.media(id), true);
  }
  private async download(
    res: Response,
    load: () => ReturnType<FileService["media"]>,
    isPublic: boolean,
  ) {
    try {
      const file = await load();
      try {
        res.set({
          "Content-Type": file.mimeType,
          "Content-Length": String(file.size),
          "Content-Disposition": `${isPublic ? "inline" : "attachment"}; filename="${encodeURIComponent(file.filename)}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": isPublic
            ? "public, max-age=3600, must-revalidate"
            : "private, no-store",
        });
        try {
          await pipeline(file.stream(), res);
        } catch {
          res.destroy();
        }
      } finally {
        await file.close().catch(() => {});
      }
    } catch (error) {
      if (error instanceof AuthFault) {
        res
          .status(error.status)
          .send(
            error.status === 401
              ? "Unauthorized"
              : error.status === 403
                ? "Forbidden"
                : "Not found",
          );
        return;
      }
      throw error;
    }
  }
}
@ApiTags("Media management")
@Controller(["api/admin/media", "api/v1/admin/media"])
@UseGuards(PermissionGuard)
@RequiresPermission("media.manage")
export class MediaController {
  constructor(@Inject(FileService) private readonly files: FileService) {}
  @Get() list(@Req() req: FileRequest, @Query("page") page?: string) {
    return this.files.listMedia(req.actor, page);
  }
  @Post()
  @RequiresPermission("media.upload")
  @UseInterceptors(FileInterceptor("file", { limits: limits(MAX_MEDIA_SIZE) }))
  @UseFilters(UploadErrors)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary" },
        altText: { type: "string" },
      },
    },
  })
  upload(
    @Req() req: FileRequest,
    @UploadedFile() file: MultipartFile | undefined,
    @Body("altText") altText: unknown,
  ) {
    if (!file) throw new AuthFault(400, "no_file");
    return this.files.uploadMedia(
      req.actor,
      asFile(file),
      String(altText ?? ""),
    );
  }
  @Patch(":id") update(
    @Req() req: FileRequest,
    @Param("id") id: string,
    @Body() body: MediaPatchDto,
  ) {
    return this.files.updateMedia(req.actor, id, body);
  }
  @Delete(":id") remove(@Req() req: FileRequest, @Param("id") id: string) {
    return this.files.deleteMedia(req.actor, id);
  }
}
