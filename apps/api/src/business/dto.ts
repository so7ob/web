import {
  Allow,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
  IsOptional,
  Matches,
  ValidateIf,
  IsString,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  validateProjectRequest,
  type ProjectRequestInput,
} from "@so7ob/contracts";
@ValidatorConstraint({ name: "sourceRequestField", async: false })
class RequestField implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const parsed = validateProjectRequest(args.object);
    return (
      parsed.ok || !parsed.errors[args.property as keyof ProjectRequestInput]
    );
  }
  defaultMessage(args: ValidationArguments) {
    const parsed = validateProjectRequest(args.object);
    return parsed.ok
      ? "invalid"
      : (parsed.errors[args.property as keyof ProjectRequestInput] ??
          "invalid");
  }
}
export class ProjectSubmissionDto {
  @ApiProperty() @Validate(RequestField) requestType!: string;
  @ApiProperty() @Validate(RequestField) serviceType!: string;
  @ApiProperty() @Validate(RequestField) description!: string;
  @ApiProperty() @Validate(RequestField) budget!: string;
  @ApiPropertyOptional() @Validate(RequestField) currency?: string;
  @ApiProperty() @Validate(RequestField) timeline!: string;
  @ApiProperty() @Validate(RequestField) name!: string;
  @ApiPropertyOptional() @Validate(RequestField) company?: string;
  @ApiProperty() @Validate(RequestField) email!: string;
  @ApiPropertyOptional() @Validate(RequestField) phone?: string;
  @ApiProperty() @Validate(RequestField) preferredContact!: string;
  @ApiPropertyOptional() @Validate(RequestField) referenceUrl?: string;
  @ApiPropertyOptional() @Allow() website?: unknown;
  @ApiPropertyOptional() @Allow() startedAt?: unknown;
  @ApiPropertyOptional() @Allow() locale?: unknown;
}
const text = (value: unknown) => String(value ?? "");
export class InquirySubmissionDto {
  @ApiProperty()
  @Transform(({ value }) => text(value).trim().slice(0, 200))
  @IsString({ message: "required" })
  @Matches(/^[\s\S]{3,}$/, { message: "required" })
  subject!: string;
  @ApiProperty()
  @Transform(({ value }) => text(value).trim().slice(0, 5000))
  @IsString({ message: "required" })
  @Matches(/^[\s\S]{10,}$/, { message: "required" })
  message!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value == null ? undefined : text(value).trim().slice(0, 100),
  )
  @Matches(/^[\s\S]{2,}$/, { message: "required" })
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value == null ? undefined : text(value).trim().toLowerCase().slice(0, 200),
  )
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, { message: "invalidEmail" })
  email?: string;
  @ApiPropertyOptional() @Allow() category?: unknown;
  @ApiPropertyOptional() @Allow() locale?: unknown;
}
export class ProfileDto {
  @ApiPropertyOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().slice(0, 100) : value,
  )
  @ValidateIf((_o, v) => typeof v === "string")
  @Matches(/^[\s\S]{2,}$/, { message: "name_invalid" })
  name?: unknown;
  @ApiPropertyOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().slice(0, 20) : value,
  )
  @ValidateIf((_o, v) => typeof v === "string" && v !== "")
  @Matches(/^[+]?[\d\s\-()]{7,20}$/, { message: "phone_invalid" })
  phone?: unknown;
  @ApiPropertyOptional() @Allow() company?: unknown;
  @ApiPropertyOptional() @Allow() locale?: unknown;
}
export class DraftDto {
  @Allow() requestType?: unknown;
  @Allow() serviceType?: unknown;
  @Allow() description?: unknown;
  @Allow() budget?: unknown;
  @Allow() currency?: unknown;
  @Allow() timeline?: unknown;
  @Allow() name?: unknown;
  @Allow() company?: unknown;
  @Allow() phone?: unknown;
  @Allow() preferredContact?: unknown;
  @Allow() referenceUrl?: unknown;
  @Allow() locale?: unknown;
}
export class ReadNotificationDto {
  @ApiPropertyOptional() @Allow() id?: unknown;
  @ApiPropertyOptional() @Allow() all?: unknown;
}
export class MessageDto {
  @ApiProperty() @Allow() body?: unknown;
  @ApiPropertyOptional() @Allow() kind?: unknown;
}
export class RequestPatchDto {
  @Allow() action?: unknown;
  @Allow() note?: unknown;
  @Allow() description?: unknown;
  @Allow() referenceUrl?: unknown;
  @Allow() phone?: unknown;
  @Allow() company?: unknown;
  @Allow() budget?: unknown;
  @Allow() currency?: unknown;
  @Allow() timeline?: unknown;
  @Allow() preferredContact?: unknown;
  @Allow() serviceType?: unknown;
}
export class PortalInquiryDto {
  @ApiProperty()
  @Transform(({ value }) => text(value).trim().slice(0, 200))
  @IsString({ message: "required" })
  @Matches(/^[\s\S]{3,}$/, { message: "required" })
  subject!: string;
  @ApiProperty()
  @Transform(({ value }) => text(value).trim().slice(0, 5000))
  @IsString({ message: "required" })
  @Matches(/^[\s\S]{10,}$/, { message: "required" })
  message!: string;
  @ApiPropertyOptional() @Allow() category?: unknown;
  @ApiPropertyOptional() @Allow() locale?: unknown;
}
export class ConversationQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value[0] : value))
  @IsString()
  q?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value[0] : value))
  @IsString()
  status?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value[0] : value))
  @IsString()
  awaiting?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value[0] : value))
  @IsString()
  page?: string;
}
