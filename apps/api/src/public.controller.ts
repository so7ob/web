import { Controller, Get, Inject, Query, Req, Header } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuthenticationService } from '@so7ob/server';
import { AuthHttpPolicy } from './auth/policy.js';
import { PublicService } from './public.service.js';
export class PublicViewQuery {
  @ApiProperty({ example: '/ar/about', maxLength: 2048 })
  @IsString() @MaxLength(2048) @Matches(/^\/(?!\/)/)
  path!: string;
}
@ApiTags('Published content')
@Controller('api/v1/public')
export class PublicController {
  constructor(@Inject(PublicService) private readonly content: PublicService, @Inject(AuthenticationService) private readonly auth: AuthenticationService, @Inject(AuthHttpPolicy) private readonly policy: AuthHttpPolicy) {}
  @Get('view') @Header('Cache-Control','no-store') async view(@Query() query: PublicViewQuery,@Req() req:Request) { const session=await this.auth.session(this.policy.cookie(req,this.policy.sessionCookie)); return this.content.view(query.path,session?.user ?? null); }
}
