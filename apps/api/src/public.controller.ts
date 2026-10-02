import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { PublicService } from './public.service.js';
export class PublicViewQuery {
  @ApiProperty({ example: '/ar/about', maxLength: 2048 })
  @IsString() @MaxLength(2048) @Matches(/^\/(?!\/)/)
  path!: string;
}
@ApiTags('Published content')
@Controller('api/v1/public')
export class PublicController {
  constructor(@Inject(PublicService) private readonly content: PublicService) {}
  @Get('view') view(@Query() query: PublicViewQuery) { return this.content.view(query.path); }
}
