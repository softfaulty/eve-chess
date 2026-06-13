import { Body, Controller, Get, Post } from '@nestjs/common';
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

  @Post('engine')
  engine(@Body() body: { kind?: string; side?: string }) {
    if (
      (body.side === 'white' || body.side === 'black') &&
      (body.kind === 'random-v1' ||
        body.kind === 'material-v1' ||
        body.kind === 'minimax-v1' ||
        body.kind === 'minimax-v2')
    ) {
      return this.matchService.setEngine(body.side, body.kind);
    }

    return this.matchService.getState();
  }
}
