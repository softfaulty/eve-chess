import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BenchmarkService } from './benchmark.service';

@Controller()
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  @Post('benchmark/start')
  start(
    @Body()
    body: {
      black?: string;
      games?: number;
      swapColors?: boolean;
      white?: string;
    },
  ) {
    return this.benchmarkService.start(body);
  }

  @Post('benchmark/stop')
  stop() {
    return this.benchmarkService.stop();
  }

  @Get('benchmark/state')
  state() {
    return this.benchmarkService.getState();
  }

  @Get('benchmarks')
  benchmarks() {
    return this.benchmarkService.findAll();
  }

  @Get('benchmarks/:id')
  benchmark(@Param('id') id: string) {
    return this.benchmarkService.findOne(id);
  }
}
