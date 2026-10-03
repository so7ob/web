import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
const string = (value: unknown) => String(value ?? '');
@ValidatorConstraint({ name:'registrationPassword',async:false })
class RegistrationPassword implements ValidatorConstraintInterface {
  validate(value:unknown){return typeof value==='string'&&value.length>=8&&value.length<=100&&/[A-Za-z]/.test(value)&&/\d/.test(value);}
  defaultMessage(args?:{value:unknown}){const value=String(args?.value??'');return value.length<8?'password_short':value.length>100?'password_long':'password_weak';}
}
export class RegisterDto {
  @ApiProperty() @Transform(({ value })=>string(value).trim().slice(0,100)) @Matches(/^[\s\S]{2,100}$/,{ message:'name_invalid' }) name:string='';
  @ApiProperty() @Transform(({ value })=>string(value).trim().toLowerCase().slice(0,200)) @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,{ message:'email_invalid' }) email!:string;
  @ApiProperty({ writeOnly:true }) @Transform(({ value })=>string(value)) @Validate(RegistrationPassword) password:string='';
  @ApiPropertyOptional({ enum:['ar','en'] }) @Transform(({ value })=>value==='en'?'en':'ar') @IsIn(['ar','en']) locale:'ar'|'en'='ar';
}
export class LoginDto {
  @ApiProperty() @IsString() @MaxLength(254) email!:string;
  @ApiProperty({ writeOnly:true }) @IsString() @MaxLength(1024) password!:string;
  @ApiProperty() @IsString() @MaxLength(64) csrfToken!:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) callbackUrl?:string;
  @IsOptional() @IsString() json?:string;
}
export class ForgotDto {
  @ApiProperty() @Transform(({ value })=>string(value).trim().toLowerCase().slice(0,200)) @IsString() email:string='';
}
export class ResetDto {
  @ApiProperty({ writeOnly:true }) @Transform(({ value })=>string(value)) @IsString() @MaxLength(256) token!:string;
  @ApiProperty({ writeOnly:true }) @Transform(({ value })=>string(value)) @IsString() @MaxLength(100) password!:string;
}
export class ChangePasswordDto {
  @ApiProperty({ writeOnly:true }) @IsString() @MaxLength(1024) currentPassword!:string;
  @ApiProperty({ writeOnly:true }) @IsString() @MaxLength(100) newPassword!:string;
}
export class InviteDto extends ResetDto {
  @ApiProperty() @Transform(({ value })=>string(value).trim().slice(0,100)) @Matches(/^[\s\S]{2,100}$/,{ message:'name_invalid' }) name:string='';
}
export class RevokeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) id?:string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() all?:boolean;
}
export class SignoutDto {
  @ApiProperty() @IsString() @MaxLength(64) csrfToken!:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2048) callbackUrl?:string;
  @IsOptional() @IsString() json?:string;
}
