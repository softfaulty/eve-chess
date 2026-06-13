import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';

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
export class MatchService {
  private game = new Chess();
  private interval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastMove: LastMove = null;
  private result: string | null = null;
  private status = 'Ready.';

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

  start(): MatchState {
    if (this.isRunning || this.game.isGameOver()) {
      return this.getState();
    }

    this.isRunning = true;
    this.status = 'Running.';
    this.interval = setInterval(() => {
      const moves = this.game.moves({ verbose: true });

      if (moves.length === 0 || this.game.isGameOver()) {
        this.stop();
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

      if (this.game.isCheckmate()) {
        this.result = this.game.turn() === 'w' ? '0-1' : '1-0';
        this.status = `Checkmate. ${this.game.turn() === 'w' ? 'Black' : 'White'} wins.`;
        this.stop();
      } else if (this.game.isDraw()) {
        this.result = '1/2-1/2';
        this.status = 'Draw.';
        this.stop();
      } else if (this.game.isCheck()) {
        this.status = `${this.game.turn() === 'w' ? 'White' : 'Black'} is in check.`;
      } else {
        this.status = 'Running.';
      }
    }, 700);

    return this.getState();
  }

  stop(): MatchState {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;

    if (!this.game.isGameOver() && this.status === 'Running.') {
      this.status = 'Stopped.';
    }

    return this.getState();
  }

  reset(): MatchState {
    this.stop();
    this.game.reset();
    this.lastMove = null;
    this.result = null;
    this.status = 'Ready.';

    return this.getState();
  }
}
