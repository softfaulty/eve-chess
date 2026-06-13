import { Injectable, OnModuleInit } from '@nestjs/common';
import { Chess, Move } from 'chess.js';
import { PrismaService } from '../prisma/prisma.service';

type LastMove = {
  from: string;
  san: string;
  to: string;
} | null;

export type MatchState = {
  evalAfter: number;
  fen: string;
  isRunning: boolean;
  lastMove: LastMove;
  moveCount: number;
  pgn: string;
  result: string | null;
  status: string;
  turn: 'White' | 'Black';
};

const pieceValues = {
  b: 330,
  k: 0,
  n: 320,
  p: 100,
  q: 900,
  r: 500,
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
      where: { name: 'Material White' },
      update: {
        kind: 'material-v1',
      },
      create: {
        kind: 'material-v1',
        name: 'Material White',
      },
    });
    const blackEngine = await this.prisma.engine.upsert({
      where: { name: 'Material Black' },
      update: {
        kind: 'material-v1',
      },
      create: {
        kind: 'material-v1',
        name: 'Material Black',
      },
    });

    this.whiteEngineId = whiteEngine.id;
    this.blackEngineId = blackEngine.id;
  }

  getState(): MatchState {
    return {
      evalAfter: this.evaluateMaterial(),
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

  private evaluateMaterial(): number {
    if (this.game.isCheckmate()) {
      return this.game.turn() === 'w' ? -100000 : 100000;
    }

    if (this.game.isDraw()) {
      return 0;
    }

    return this.game
      .board()
      .flat()
      .reduce((score, piece) => {
        if (!piece) {
          return score;
        }

        const multiplier = piece.color === 'w' ? 1 : -1;

        return score + pieceValues[piece.type] * multiplier;
      }, 0);
  }

  private pickMove(): Move {
    const moves = this.game.moves({ verbose: true });
    const bestMoves: Move[] = [];
    let bestScore = this.game.turn() === 'w' ? -Infinity : Infinity;

    for (const move of moves) {
      this.game.move({
        from: move.from,
        promotion: move.promotion ?? 'q',
        to: move.to,
      });

      const score = this.evaluateMaterial();
      this.game.undo();

      if (
        (this.game.turn() === 'w' && score > bestScore) ||
        (this.game.turn() === 'b' && score < bestScore)
      ) {
        bestScore = score;
        bestMoves.length = 0;
        bestMoves.push(move);
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
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

        const move = this.pickMove();
        const played = this.game.move({
          from: move.from,
          promotion: move.promotion ?? 'q',
          to: move.to,
        });
        const evalAfter = this.evaluateMaterial();

        this.lastMove = {
          from: played.from,
          san: played.san,
          to: played.to,
        };

        if (this.gameId) {
          await this.prisma.move.create({
            data: {
              evalAfter,
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
