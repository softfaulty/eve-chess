import { Module } from '@nestjs/common';
import { BenchmarkModule } from './benchmark/benchmark.module';
import { EnginesModule } from './engines/engines.module';
import { GamesModule } from './games/games.module';
import { MatchModule } from './match/match.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    MatchModule,
    GamesModule,
    EnginesModule,
    BenchmarkModule,
  ],
})
export class AppModule {}
