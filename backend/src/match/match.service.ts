import { Injectable, OnModuleInit } from '@nestjs/common';
import { Chess, Move } from 'chess.js';
import { PrismaService } from '../prisma/prisma.service';

type LastMove = {
  from: string;
  san: string;
  to: string;
} | null;

type EngineKind =
  | 'random-v1'
  | 'material-v1'
  | 'minimax-v1'
  | 'minimax-v2'
  | 'positional-v1';
type EngineSide = 'white' | 'black';

const engineOptions: { kind: EngineKind; name: string }[] = [
  { kind: 'random-v1', name: 'Random v1' },
  { kind: 'material-v1', name: 'Material v1' },
  { kind: 'minimax-v1', name: 'Minimax v1' },
  { kind: 'minimax-v2', name: 'Minimax v2' },
  { kind: 'positional-v1', name: 'Positional v1' },
];

export type MatchState = {
  blackEngineKind: EngineKind;
  engineOptions: { kind: EngineKind; name: string }[];
  evalAfter: number;
  fen: string;
  isRunning: boolean;
  lastMove: LastMove;
  moveCount: number;
  pgn: string;
  result: string | null;
  status: string;
  turn: 'White' | 'Black';
  whiteEngineKind: EngineKind;
};
type StateListener = (state: MatchState) => void;

const pieceValues = {
  b: 330,
  k: 0,
  n: 320,
  p: 100,
  q: 900,
  r: 500,
};
const checkmateScore = 100000;
const pieceSquareTables = {
  b: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  k: [
    [20, 30, 10, 0, 0, 10, 30, 20],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
  ],
  n: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  p: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  r: [
    [0, 0, 0, 5, 5, 0, 0, 0],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
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
  private blackEngineKind: EngineKind = 'minimax-v2';
  private currentEval = 0;
  private engineIds = new Map<string, string>();
  private isTicking = false;
  private searchCache = new Map<string, number>();
  private stateListeners = new Set<StateListener>();
  private whiteEngineId = '';
  private whiteEngineKind: EngineKind = 'minimax-v2';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const side of ['White', 'Black'] as const) {
      for (const engine of engineOptions) {
        const savedEngine = await this.prisma.engine.upsert({
          where: { name: `${side} ${engine.name}` },
          update: {
            kind: engine.kind,
          },
          create: {
            kind: engine.kind,
            name: `${side} ${engine.name}`,
          },
        });

        this.engineIds.set(
          `${side.toLowerCase()}:${engine.kind}`,
          savedEngine.id,
        );
      }
    }

    this.whiteEngineId =
      this.engineIds.get(`white:${this.whiteEngineKind}`) ?? '';
    this.blackEngineId =
      this.engineIds.get(`black:${this.blackEngineKind}`) ?? '';
    this.currentEval = this.evaluateForEngine(
      this.whiteEngineKind,
      0,
      this.game.moves({ verbose: true }),
    );
  }

  getState(): MatchState {
    return {
      blackEngineKind: this.blackEngineKind,
      engineOptions,
      evalAfter: this.currentEval,
      fen: this.game.fen(),
      isRunning: this.isRunning,
      lastMove: this.lastMove,
      moveCount: this.game.history().length,
      pgn: this.game.pgn(),
      result: this.result,
      status: this.status,
      turn: this.game.turn() === 'w' ? 'White' : 'Black',
      whiteEngineKind: this.whiteEngineKind,
    };
  }

  subscribe(listener: StateListener) {
    this.stateListeners.add(listener);
    listener(this.getState());

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private broadcastState() {
    const state = this.getState();

    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private evaluatePosition(depth = 0, moveCount?: number): number {
    const legalMoveCount = moveCount ?? this.game.moves().length;

    if (legalMoveCount === 0) {
      if (!this.game.isCheck()) {
        return 0;
      }

      return this.game.turn() === 'w'
        ? -checkmateScore - depth
        : checkmateScore + depth;
    }

    if (this.game.isDraw()) {
      return 0;
    }

    let material = 0;
    const board = this.game.board();

    for (const row of board) {
      for (const piece of row) {
        if (piece) {
          material += pieceValues[piece.type] * (piece.color === 'w' ? 1 : -1);
        }
      }
    }

    const mobility = legalMoveCount * (this.game.turn() === 'w' ? 2 : -2);
    const check = this.game.isCheck()
      ? this.game.turn() === 'w'
        ? -30
        : 30
      : 0;

    return material + mobility + check;
  }

  private evaluateMaterial(): number {
    if (this.game.isCheckmate()) {
      return this.game.turn() === 'w' ? -checkmateScore : checkmateScore;
    }

    if (this.game.isDraw()) {
      return 0;
    }

    let material = 0;
    const board = this.game.board();

    for (const row of board) {
      for (const piece of row) {
        if (piece) {
          material += pieceValues[piece.type] * (piece.color === 'w' ? 1 : -1);
        }
      }
    }

    return material;
  }

  private evaluateForEngine(
    engineKind: EngineKind,
    depth = 0,
    moves?: Move[],
  ): number {
    if (engineKind === 'positional-v1') {
      return this.evaluatePositional(depth, moves);
    }

    return this.evaluatePosition(depth, moves?.length);
  }

  private evaluatePositional(depth = 0, moves?: Move[]): number {
    const legalMoves = moves ?? this.game.moves({ verbose: true });

    if (legalMoves.length === 0) {
      if (!this.game.isCheck()) {
        return 0;
      }

      return this.game.turn() === 'w'
        ? -checkmateScore - depth
        : checkmateScore + depth;
    }

    if (this.game.isDraw()) {
      return 0;
    }

    let score = 0;
    const board = this.game.board();
    const whitePawnsByFile = Array(8).fill(0) as number[];
    const blackPawnsByFile = Array(8).fill(0) as number[];
    const whitePawnRowsByFile = Array.from({ length: 8 }, () => [] as number[]);
    const blackPawnRowsByFile = Array.from({ length: 8 }, () => [] as number[]);
    const centerSquares = new Set(['d4', 'e4', 'd5', 'e5']);
    const whiteMinorStarts = [
      [7, 1],
      [7, 2],
      [7, 5],
      [7, 6],
    ];
    const blackMinorStarts = [
      [0, 1],
      [0, 2],
      [0, 5],
      [0, 6],
    ];
    let whiteKing: [number, number] | null = null;
    let blackKing: [number, number] | null = null;
    let whiteDevelopedMinorPieces = 0;
    let blackDevelopedMinorPieces = 0;

    for (let row = 0; row < 8; row += 1) {
      for (let file = 0; file < 8; file += 1) {
        const piece = board[row][file];

        if (!piece) {
          continue;
        }

        const multiplier = piece.color === 'w' ? 1 : -1;
        const tableRow = piece.color === 'w' ? row : 7 - row;

        score +=
          multiplier *
          (pieceValues[piece.type] +
            pieceSquareTables[piece.type][tableRow][file]);

        if (piece.type === 'p') {
          if (piece.color === 'w') {
            whitePawnsByFile[file] += 1;
            whitePawnRowsByFile[file].push(row);
          } else {
            blackPawnsByFile[file] += 1;
            blackPawnRowsByFile[file].push(row);
          }
        } else if (piece.type === 'k') {
          if (piece.color === 'w') {
            whiteKing = [row, file];
          } else {
            blackKing = [row, file];
          }
        } else if (piece.type === 'n' || piece.type === 'b') {
          const isWhiteStart = whiteMinorStarts.some(
            ([startRow, startFile]) => row === startRow && file === startFile,
          );
          const isBlackStart = blackMinorStarts.some(
            ([startRow, startFile]) => row === startRow && file === startFile,
          );

          if (piece.color === 'w' && !isWhiteStart) {
            whiteDevelopedMinorPieces += 1;
          } else if (piece.color === 'b' && !isBlackStart) {
            blackDevelopedMinorPieces += 1;
          }
        }
      }
    }

    score += legalMoves.length * (this.game.turn() === 'w' ? 3 : -3);
    score += this.game.isCheck() ? (this.game.turn() === 'w' ? -35 : 35) : 0;

    for (const move of legalMoves) {
      if (centerSquares.has(move.to)) {
        score += this.game.turn() === 'w' ? 4 : -4;
      }
    }

    score += whiteDevelopedMinorPieces * 12 - blackDevelopedMinorPieces * 12;

    if (board[7][3]?.type !== 'q' && whiteDevelopedMinorPieces < 3) {
      score -= 25;
    }

    if (board[0][3]?.type !== 'q' && blackDevelopedMinorPieces < 3) {
      score += 25;
    }

    for (let file = 0; file < 8; file += 1) {
      if (whitePawnsByFile[file] > 1) {
        score -= (whitePawnsByFile[file] - 1) * 18;
      }

      if (blackPawnsByFile[file] > 1) {
        score += (blackPawnsByFile[file] - 1) * 18;
      }

      for (const row of whitePawnRowsByFile[file]) {
        const adjacentFiles = [file - 1, file + 1].filter(
          (nextFile) => nextFile >= 0 && nextFile < 8,
        );
        const isIsolated = adjacentFiles.every(
          (nextFile) => whitePawnsByFile[nextFile] === 0,
        );
        const isPassed = [file - 1, file, file + 1]
          .filter((nextFile) => nextFile >= 0 && nextFile < 8)
          .every((nextFile) =>
            blackPawnRowsByFile[nextFile].every((blackRow) => blackRow >= row),
          );

        if (isIsolated) {
          score -= 14;
        }

        if (isPassed) {
          score += 20 + (6 - row) * 6;
        }
      }

      for (const row of blackPawnRowsByFile[file]) {
        const adjacentFiles = [file - 1, file + 1].filter(
          (nextFile) => nextFile >= 0 && nextFile < 8,
        );
        const isIsolated = adjacentFiles.every(
          (nextFile) => blackPawnsByFile[nextFile] === 0,
        );
        const isPassed = [file - 1, file, file + 1]
          .filter((nextFile) => nextFile >= 0 && nextFile < 8)
          .every((nextFile) =>
            whitePawnRowsByFile[nextFile].every((whiteRow) => whiteRow <= row),
          );

        if (isIsolated) {
          score += 14;
        }

        if (isPassed) {
          score -= 20 + (row - 1) * 6;
        }
      }
    }

    for (let row = 0; row < 8; row += 1) {
      for (let file = 0; file < 8; file += 1) {
        const piece = board[row][file];

        if (piece?.type !== 'r') {
          continue;
        }

        if (piece.color === 'w') {
          if (whitePawnsByFile[file] === 0 && blackPawnsByFile[file] === 0) {
            score += 20;
          } else if (whitePawnsByFile[file] === 0) {
            score += 10;
          }
        } else if (
          whitePawnsByFile[file] === 0 &&
          blackPawnsByFile[file] === 0
        ) {
          score -= 20;
        } else if (blackPawnsByFile[file] === 0) {
          score -= 10;
        }
      }
    }

    for (const king of [whiteKing, blackKing] as const) {
      if (!king) {
        continue;
      }

      const [kingRow, kingFile] = king;
      const isWhiteKing = king === whiteKing;
      let friendlyPawnShield = 0;

      for (const file of [kingFile - 1, kingFile, kingFile + 1]) {
        if (file < 0 || file > 7) {
          continue;
        }

        const shieldRow = isWhiteKing ? kingRow - 1 : kingRow + 1;

        if (
          shieldRow >= 0 &&
          shieldRow < 8 &&
          board[shieldRow][file]?.type === 'p' &&
          board[shieldRow][file]?.color === (isWhiteKing ? 'w' : 'b')
        ) {
          friendlyPawnShield += 1;
        }
      }

      score += (3 - friendlyPawnShield) * (isWhiteKing ? -18 : 18);
    }

    return score;
  }

  private pickMove(moves: Move[]): Move {
    const engineKind =
      this.game.turn() === 'w' ? this.whiteEngineKind : this.blackEngineKind;

    if (engineKind === 'random-v1') {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    const orderedMoves = this.orderMoves(moves);
    const bestMoves: Move[] = [];
    let bestScore = this.game.turn() === 'w' ? -Infinity : Infinity;
    const depth =
      engineKind === 'material-v1'
        ? 1
        : engineKind === 'minimax-v1'
          ? 2
          : this.game.history().length < 24
            ? 2
            : 3;

    this.searchCache.clear();

    for (const move of orderedMoves) {
      this.game.move({
        from: move.from,
        promotion: 'q',
        to: move.to,
      });

      const score =
        engineKind === 'material-v1'
          ? this.evaluateMaterial()
          : this.minimax(depth - 1, -Infinity, Infinity, engineKind);
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

  async setEngine(side: EngineSide, kind: EngineKind): Promise<MatchState> {
    if (!engineOptions.some((engine) => engine.kind === kind)) {
      return this.getState();
    }

    const engineId = this.engineIds.get(`${side}:${kind}`);

    if (!engineId) {
      return this.getState();
    }

    if (side === 'white') {
      this.whiteEngineKind = kind;
      this.whiteEngineId = engineId;
    } else {
      this.blackEngineKind = kind;
      this.blackEngineId = engineId;
    }

    if (this.gameId) {
      await this.prisma.game.update({
        where: { id: this.gameId },
        data:
          side === 'white'
            ? { whiteEngineId: engineId }
            : { blackEngineId: engineId },
      });
    }

    if (this.game.turn() === side[0]) {
      this.currentEval = this.evaluateForEngine(
        kind,
        0,
        this.game.moves({ verbose: true }),
      );
    }

    this.broadcastState();
    return this.getState();
  }

  private minimax(
    depth: number,
    alpha: number,
    beta: number,
    engineKind: EngineKind,
  ): number {
    const cacheKey = `${engineKind}:${depth}:${this.game.hash()}`;
    const cachedScore = this.searchCache.get(cacheKey);

    if (cachedScore !== undefined) {
      return cachedScore;
    }

    const moves = this.orderMoves(this.game.moves({ verbose: true }));

    if (moves.length === 0 || this.game.isDraw()) {
      const score = this.evaluateForEngine(engineKind, depth, moves);
      this.searchCache.set(cacheKey, score);
      return score;
    }

    if (depth === 0) {
      const score = this.evaluateForEngine(engineKind, depth, moves);
      this.searchCache.set(cacheKey, score);
      return score;
    }

    if (this.game.turn() === 'w') {
      let bestScore = -Infinity;
      let pruned = false;

      for (const move of moves) {
        this.game.move({
          from: move.from,
          promotion: 'q',
          to: move.to,
        });

        bestScore = Math.max(
          bestScore,
          this.minimax(depth - 1, alpha, beta, engineKind),
        );
        this.game.undo();
        alpha = Math.max(alpha, bestScore);

        if (beta <= alpha) {
          pruned = true;
          break;
        }
      }

      if (!pruned) {
        this.searchCache.set(cacheKey, bestScore);
      }

      return bestScore;
    }

    let bestScore = Infinity;
    let pruned = false;

    for (const move of moves) {
      this.game.move({
        from: move.from,
        promotion: 'q',
        to: move.to,
      });

      bestScore = Math.min(
        bestScore,
        this.minimax(depth - 1, alpha, beta, engineKind),
      );
      this.game.undo();
      beta = Math.min(beta, bestScore);

      if (beta <= alpha) {
        pruned = true;
        break;
      }
    }

    if (!pruned) {
      this.searchCache.set(cacheKey, bestScore);
    }

    return bestScore;
  }

  private orderMoves(moves: Move[]): Move[] {
    let shouldSort = false;
    const scoredMoves = moves.map((move) => {
      const aScore =
        (move.captured ? 1000 : 0) +
        (move.promotion ? pieceValues[move.promotion] : 0) +
        (move.san.includes('+') || move.san.includes('#') ? 100 : 0);

      if (aScore > 0) {
        shouldSort = true;
      }

      return { move, score: aScore };
    });

    if (!shouldSort) {
      return moves;
    }

    return scoredMoves
      .sort((a, b) => b.score - a.score)
      .map((scoredMove) => scoredMove.move);
  }

  private async createGame() {
    const game = await this.prisma.game.create({
      data: {
        blackEngineId: this.blackEngineId,
        status: 'Running.',
        whiteEngineId: this.whiteEngineId,
      },
    });

    this.gameId = game.id;
    this.currentEval = this.evaluateForEngine(
      this.whiteEngineKind,
      0,
      this.game.moves({ verbose: true }),
    );
    this.broadcastState();
  }

  private async finishGame() {
    if (!this.gameId || !this.result) {
      return;
    }

    this.game.setHeader('Result', this.result);
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

  async start(): Promise<MatchState> {
    if (this.isRunning || this.game.isGameOver()) {
      return this.getState();
    }

    if (!this.gameId) {
      await this.createGame();
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

    this.broadcastState();

    this.interval = setInterval(() => {
      void (async () => {
        if (this.isTicking) {
          return;
        }

        this.isTicking = true;

        try {
          const moves = this.game.moves({ verbose: true });

          if (moves.length === 0) {
            if (this.game.isCheck()) {
              this.result = this.game.turn() === 'w' ? '0-1' : '1-0';
              this.status = `Checkmate. ${this.game.turn() === 'w' ? 'Black' : 'White'} wins.`;
              await this.finishGame();
              await this.stop();
              this.broadcastState();
              return;
            }

            this.result = '1/2-1/2';
            this.status = 'Draw.';
            await this.finishGame();
            this.game.reset();
            this.lastMove = null;
            this.result = null;
            this.status = 'Running.';
            await this.createGame();
            return;
          }

          if (this.game.isDraw()) {
            this.result = '1/2-1/2';
            this.status = 'Draw.';
            await this.finishGame();
            this.game.reset();
            this.lastMove = null;
            this.result = null;
            this.status = 'Running.';
            await this.createGame();
            return;
          }

          const playedEngineKind =
            this.game.turn() === 'w'
              ? this.whiteEngineKind
              : this.blackEngineKind;
          const move = this.pickMove(moves);
          const played = this.game.move({
            from: move.from,
            promotion: 'q',
            to: move.to,
          });
          const nextMoves = this.game.moves({ verbose: true });
          const evalAfter = this.evaluateForEngine(
            playedEngineKind,
            0,
            nextMoves,
          );

          this.currentEval = evalAfter;

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

          if (!this.isRunning) {
            this.broadcastState();
            return;
          }

          if (nextMoves.length === 0) {
            if (this.game.isCheck()) {
              this.result = this.game.turn() === 'w' ? '0-1' : '1-0';
              this.status = `Checkmate. ${this.game.turn() === 'w' ? 'Black' : 'White'} wins.`;
              await this.finishGame();
              await this.stop();
            } else {
              this.result = '1/2-1/2';
              this.status = 'Draw.';
              await this.finishGame();

              if (this.isRunning) {
                this.game.reset();
                this.lastMove = null;
                this.result = null;
                this.status = 'Running.';
                await this.createGame();
              }
            }
          } else if (this.game.isDraw()) {
            this.result = '1/2-1/2';
            this.status = 'Draw.';
            await this.finishGame();

            if (this.isRunning) {
              this.game.reset();
              this.lastMove = null;
              this.result = null;
              this.status = 'Running.';
              await this.createGame();
            }
          } else if (this.game.isCheck()) {
            this.status = `${this.game.turn() === 'w' ? 'White' : 'Black'} is in check.`;
          } else {
            this.status = 'Running.';
          }

          this.broadcastState();
        } finally {
          this.isTicking = false;
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
    this.isTicking = false;

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

    await this.finishGame();
    this.broadcastState();

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
    this.currentEval = this.evaluateForEngine(
      this.whiteEngineKind,
      0,
      this.game.moves({ verbose: true }),
    );
    this.lastMove = null;
    this.result = null;
    this.status = 'Ready.';
    this.broadcastState();

    return this.getState();
  }
}
