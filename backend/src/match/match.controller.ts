import { Controller, Get, Post } from '@nestjs/common';
import { MatchService } from './match.service';

@Controller('match')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Get('state')
  state() {
    return this.matchService.getState();
  }

  @Post('start')
  start() {
    return this.matchService.start();
  }

  @Post('stop')
  stop() {
    return this.matchService.stop();
  }

  @Post('reset')
  reset() {
    return this.matchService.reset();
  }
}
