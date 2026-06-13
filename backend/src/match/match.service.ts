import { Injectable, OnModuleInit } from '@nestjs/common';
import { Chess } from 'chess.js';
import { PrismaService } from '../prisma/prisma.service';

type LastMove = {
  from: string;
  san: string;
  to: string;
} | null;

export type MatchState = {
  fen: string;
  isRunning: boolean;
  lastMove: LastMove;
  moveCount: number;
  pgn: string;
  result: string | null;
  status: string;
  turn: 'White' | 'Black';
};

@Injectable()
export class MatchService implements OnModuleInit {
  private game = new Chess();
  private gameId: string | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastMove: LastMove = null;
  private result: string | null = null;
  private status = 'Ready.';
  private blackEngineId = '';
  private whiteEngineId = '';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const whiteEngine = await this.prisma.engine.upsert({
      where: { name: 'Random White' },
      update: {},
      create: {
        kind: 'random',
        name: 'Random White',
      },
    });
    const blackEngine = await this.prisma.engine.upsert({
      where: { name: 'Random Black' },
      update: {},
      create: {
        kind: 'random',
        name: 'Random Black',
      },
    });

    this.whiteEngineId = whiteEngine.id;
    this.blackEngineId = blackEngine.id;
  }

  getState(): MatchState {
    return {
      fen: this.game.fen(),
      isRunning: this.isRunning,
      lastMove: this.lastMove,
      moveCount: this.game.history().length,
      pgn: this.game.pgn(),
      result: this.result,
      status: this.status,
      turn: this.game.turn() === 'w' ? 'White' : 'Black',
    };
  }

  async start(): Promise<MatchState> {
    if (this.isRunning || this.game.isGameOver()) {
      return this.getState();
    }

    if (!this.gameId) {
      const game = await this.prisma.game.create({
        data: {
          blackEngineId: this.blackEngineId,
          status: 'Running.',
          whiteEngineId: this.whiteEngineId,
        },
      });

      this.gameId = game.id;
    }

    this.isRunning = true;
    this.status = 'Running.';

    if (this.gameId) {
      await this.prisma.game.update({
        where: { id: this.gameId },
        data: {
          status: this.status,
        },
      });
    }

    this.interval = setInterval(() => {
      void (async () => {
        const moves = this.game.moves({ verbose: true });

        if (moves.length === 0 || this.game.isGameOver()) {
          await this.stop();
          return;
        }

        const move = moves[Math.floor(Math.random() * moves.length)];
        const played = this.game.move({
          from: move.from,
          promotion: move.promotion ?? 'q',
          to: move.to,
        });

        this.lastMove = {
          from: played.from,
          san: played.san,
          to: played.to,
        };

        if (this.gameId) {
          await this.prisma.move.create({
            data: {
              fenAfter: this.game.fen(),
              from: played.from,
              gameId: this.gameId,
              ply: this.game.history().length,
              san: played.san,
              to: played.to,
            },
          });
        }

        if (this.game.isCheckmate()) {
          this.result = this.game.turn() === 'w' ? '0-1' : '1-0';
          this.status = `Checkmate. ${this.game.turn() === 'w' ? 'Black' : 'White'} wins.`;
          await this.stop();
        } else if (this.game.isDraw()) {
          this.result = '1/2-1/2';
          this.status = 'Draw.';
          await this.stop();
        } else if (this.game.isCheck()) {
          this.status = `${this.game.turn() === 'w' ? 'White' : 'Black'} is in check.`;
        } else {
          this.status = 'Running.';
        }
      })();
    }, 700);

    return this.getState();
  }

  async stop(): Promise<MatchState> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;

    if (!this.game.isGameOver() && this.status === 'Running.') {
      this.status = 'Stopped.';
    }

    if (this.gameId && !this.game.isGameOver()) {
      await this.prisma.game.update({
        where: { id: this.gameId },
        data: {
          moveCount: this.game.history().length,
          pgn: this.game.pgn(),
          status: this.status,
        },
      });
    }

    if (this.gameId && this.game.isGameOver()) {
      await this.prisma.game.update({
        where: { id: this.gameId },
        data: {
          endedAt: new Date(),
          finalFen: this.game.fen(),
          moveCount: this.game.history().length,
          pgn: this.game.pgn(),
          result: this.result,
          status: this.status,
        },
      });
      this.gameId = null;
    }

    return this.getState();
  }

  async reset(): Promise<MatchState> {
    await this.stop();

    if (this.gameId) {
      await this.prisma.game.update({
        where: { id: this.gameId },
        data: {
          endedAt: new Date(),
          finalFen: this.game.fen(),
          moveCount: this.game.history().length,
          pgn: this.game.pgn(),
          result: this.result,
          status: 'Reset.',
        },
      });
    }

    this.game.reset();
    this.gameId = null;
    this.lastMove = null;
    this.result = null;
    this.status = 'Ready.';

    return this.getState();
  }
}
