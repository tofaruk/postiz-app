import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

// The Publish page's free queue slots: the channels to look at and how many days ahead.
export class GetPostsListSlotsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Transform(({ value }) => (value ? String(value).split(',').filter(Boolean) : []))
  integrations: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  @Transform(({ value }) => parseInt(value, 10))
  days?: number = 14;
}
