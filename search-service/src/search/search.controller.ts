import { Controller, Get, Logger, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { SearchService } from './search.service';

class SearchFlightDto {
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() passengers?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
}

@Controller()
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly searchService: SearchService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'search-service' };
  }

  @Get('flights')
  search(@Query() query: SearchFlightDto) {
    return this.searchService.searchFlights(query);
  }

  @Get('flights/seed')
  seed() {
    return this.searchService.seedSampleFlights();
  }
}
