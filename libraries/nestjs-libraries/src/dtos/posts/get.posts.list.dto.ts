import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsIn,
  IsArray,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

// 'error': posts that failed to publish (the Publish page's Failed tab).
export type PostListStateFilter = 'all' | 'scheduled' | 'draft' | 'published' | 'error';

export class GetPostsListDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @IsOptional()
  @IsString()
  customer?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (value ? value.split(',') : []))
  integrations?: string[];

  @IsOptional()
  @IsIn(['all', 'scheduled', 'draft', 'published', 'error'])
  state?: PostListStateFilter = 'all';

  // The Publish page's search: a post id or group, or words in the text, a tag or the channel name.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
