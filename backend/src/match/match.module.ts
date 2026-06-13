import { Module } from '@nestjs/common';
import { MatchController } from './match.controller';
import { MatchGateway } from './match.gateway';
import { MatchService } from './match.service';

@Module({
  controllers: [MatchController],
  providers: [MatchService, MatchGateway],
})
export class MatchModule {}
