import { Injectable } from '@nestjs/common';
import { Chess, Move } from 'chess.js';
import { PrismaService } from '../prisma/prisma.service';

type BenchmarkEngine = 'random' | 'material' | 'minimax' | 'positional';
type EngineKind = 'random-v1' | 'material-v1' | 'minimax-v2' | 'positional-v1';

export type BenchmarkState = {
  averagePlyCount: number;
  blackEngine: BenchmarkEngine;
  completedGames: number;
  currentGameId: string | null;
  draws: number;
  endedAt: Date | null;
  fen: string;
  isBenchmarkRunning: boolean;
  lastMove: {
    from: string;
    san: string;
    to: string;
  } | null;
  startedAt: Date | null;
  totalGames: number;
  turn: 'White' | 'Black';
  whiteEngine: BenchmarkEngine;
  winsBlack: number;
  winsWhite: number;
};

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
export class BenchmarkService {
  private activeRunId: string | null = null;
  private shouldStop = false;
  private state: BenchmarkState = {
    averagePlyCount: 0,
    blackEngine: 'minimax',
    completedGames: 0,
    currentGameId: null,
    draws: 0,
    endedAt: null,
    fen: new Chess().fen(),
    isBenchmarkRunning: false,
    lastMove: null,
    startedAt: null,
    totalGames: 0,
    turn: 'White',
    whiteEngine: 'positional',
    winsBlack: 0,
    winsWhite: 0,
  };

  constructor(private readonly prisma: PrismaService) {}

  getState() {
    return this.state;
  }

  findAll() {
    return this.prisma.benchmarkRun.findMany({
      orderBy: {
        startedAt: 'desc',
      },
      take: 20,
    });
  }

  findOne(id: string) {
    return this.prisma.benchmarkRun.findUnique({
      where: { id },
      include: {
        games: {
          include: {
            blackEngine: true,
            whiteEngine: true,
          },
          orderBy: {
            startedAt: 'asc',
          },
        },
      },
    });
  }

  async start(body: {
    black?: string;
    games?: number;
    swapColors?: boolean;
    white?: string;
  }) {
    if (this.state.isBenchmarkRunning) {
      return this.state;
    }

    const white =
      body.white === 'random' ||
      body.white === 'material' ||
      body.white === 'minimax' ||
      body.white === 'positional'
        ? body.white
        : 'minimax';
    const black =
      body.black === 'random' ||
      body.black === 'material' ||
      body.black === 'minimax' ||
      body.black === 'positional'
        ? body.black
        : 'minimax';
    const totalGames = [10, 50, 100].includes(body.games ?? 0)
      ? (body.games as 10 | 50 | 100)
      : 10;
    const run = await this.prisma.benchmarkRun.create({
      data: {
        blackEngine: black,
        isRunning: true,
        swapColors: body.swapColors ?? false,
        totalGames,
        whiteEngine: white,
      },
    });

    this.activeRunId = run.id;
    this.shouldStop = false;
    this.state = {
      averagePlyCount: 0,
      blackEngine: black,
      completedGames: 0,
      currentGameId: null,
      draws: 0,
      endedAt: null,
      fen: new Chess().fen(),
      isBenchmarkRunning: true,
      lastMove: null,
      startedAt: run.startedAt,
      totalGames,
      turn: 'White',
      whiteEngine: white,
      winsBlack: 0,
      winsWhite: 0,
    };

    void this.run(body.swapColors ?? false);
    return this.state;
  }

  async stop() {
    this.shouldStop = true;
    this.state = {
      ...this.state,
      endedAt: new Date(),
      isBenchmarkRunning: false,
    };

    if (this.activeRunId) {
      await this.prisma.benchmarkRun.update({
        where: { id: this.activeRunId },
        data: {
          endedAt: this.state.endedAt,
          isRunning: false,
        },
      });
    }

    return this.state;
  }

  private async run(swapColors: boolean) {
    while (
      this.state.isBenchmarkRunning &&
      !this.shouldStop &&
      this.state.completedGames < this.state.totalGames
    ) {
      const shouldSwap = swapColors && this.state.completedGames % 2 === 1;
      const white = shouldSwap
        ? this.state.blackEngine
        : this.state.whiteEngine;
      const black = shouldSwap
        ? this.state.whiteEngine
        : this.state.blackEngine;
      const result = await this.playGame(white, black);

      if (!result) {
        break;
      }

      const winsWhite =
        this.state.winsWhite + (result.result === '1-0' ? 1 : 0);
      const winsBlack =
        this.state.winsBlack + (result.result === '0-1' ? 1 : 0);
      const draws = this.state.draws + (result.result === '1/2-1/2' ? 1 : 0);
      const completedGames = this.state.completedGames + 1;
      const averagePlyCount =
        (this.state.averagePlyCount * this.state.completedGames +
          result.moveCount) /
        completedGames;

      this.state = {
        ...this.state,
        averagePlyCount,
        completedGames,
        currentGameId: null,
        draws,
        winsBlack,
        winsWhite,
      };

      if (this.activeRunId) {
        await this.prisma.benchmarkRun.update({
          where: { id: this.activeRunId },
          data: {
            averagePlyCount,
            completedGames,
            draws,
            winsBlack,
            winsWhite,
          },
        });
      }
    }

    if (this.state.isBenchmarkRunning) {
      await this.stop();
    }
  }

  private async playGame(white: BenchmarkEngine, black: BenchmarkEngine) {
    if (!this.activeRunId) {
      return null;
    }

    const game = new Chess();
    const whiteKind =
      white === 'random'
        ? 'random-v1'
        : white === 'material'
          ? 'material-v1'
          : white === 'positional'
            ? 'positional-v1'
            : 'minimax-v2';
    const blackKind =
      black === 'random'
        ? 'random-v1'
        : black === 'material'
          ? 'material-v1'
          : black === 'positional'
            ? 'positional-v1'
            : 'minimax-v2';
    const savedGame = await this.prisma.game.create({
      data: {
        benchmarkId: this.activeRunId,
        blackEngineId: await this.engineId(blackKind),
        status: 'Benchmark running.',
        whiteEngineId: await this.engineId(whiteKind),
      },
    });

    this.state = {
      ...this.state,
      currentGameId: savedGame.id,
      fen: game.fen(),
      lastMove: null,
      turn: 'White',
    };

    while (!this.shouldStop) {
      const moves = game.moves({ verbose: true });

      if (moves.length === 0 || game.isDraw()) {
        break;
      }

      const engineKind = game.turn() === 'w' ? whiteKind : blackKind;
      const move = this.pickMove(game, engineKind, moves);
      const played = game.move({
        from: move.from,
        promotion: 'q',
        to: move.to,
      });
      const nextMoves = game.moves({ verbose: true });
      const evalAfter = this.evaluateForEngine(game, engineKind, 0, nextMoves);

      this.state = {
        ...this.state,
        fen: game.fen(),
        lastMove: {
          from: played.from,
          san: played.san,
          to: played.to,
        },
        turn: game.turn() === 'w' ? 'White' : 'Black',
      };

      await this.prisma.move.create({
        data: {
          evalAfter,
          fenAfter: game.fen(),
          from: played.from,
          gameId: savedGame.id,
          ply: game.history().length,
          san: played.san,
          to: played.to,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    if (this.shouldStop) {
      await this.prisma.game.update({
        where: { id: savedGame.id },
        data: {
          finalFen: game.fen(),
          moveCount: game.history().length,
          pgn: game.pgn(),
          status: 'Benchmark stopped.',
        },
      });
      return null;
    }

    const result = game.isCheckmate()
      ? game.turn() === 'w'
        ? '0-1'
        : '1-0'
      : '1/2-1/2';
    const status =
      result === '1/2-1/2'
        ? 'Benchmark draw.'
        : `Benchmark checkmate. ${result === '1-0' ? 'White' : 'Black'} wins.`;

    game.setHeader('Result', result);
    await this.prisma.game.update({
      where: { id: savedGame.id },
      data: {
        endedAt: new Date(),
        finalFen: game.fen(),
        moveCount: game.history().length,
        pgn: game.pgn(),
        result,
        status,
      },
    });

    return {
      moveCount: game.history().length,
      result,
    };
  }

  private pickMove(game: Chess, engineKind: EngineKind, moves: Move[]) {
    if (engineKind === 'random-v1') {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    const orderedMoves = this.orderMoves(moves);
    const bestMoves: Move[] = [];
    const isWhite = game.turn() === 'w';
    let bestScore = isWhite ? -Infinity : Infinity;
    const depth =
      engineKind === 'material-v1' ? 1 : game.history().length < 24 ? 2 : 3;
    const searchCache = new Map<string, number>();

    for (const move of orderedMoves) {
      game.move({
        from: move.from,
        promotion: 'q',
        to: move.to,
      });

      const score =
        engineKind === 'material-v1'
          ? this.evaluateMaterial(game)
          : this.minimax(
              game,
              engineKind,
              depth - 1,
              -Infinity,
              Infinity,
              searchCache,
            );
      game.undo();

      if ((isWhite && score > bestScore) || (!isWhite && score < bestScore)) {
        bestScore = score;
        bestMoves.length = 0;
        bestMoves.push(move);
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  private minimax(
    game: Chess,
    engineKind: EngineKind,
    depth: number,
    alpha: number,
    beta: number,
    searchCache: Map<string, number>,
  ): number {
    const cacheKey = `${engineKind}:${depth}:${game.hash()}`;
    const cachedScore = searchCache.get(cacheKey);

    if (cachedScore !== undefined) {
      return cachedScore;
    }

    const moves = this.orderMoves(game.moves({ verbose: true }));

    if (moves.length === 0 || game.isDraw()) {
      const score = this.evaluateForEngine(game, engineKind, depth, moves);
      searchCache.set(cacheKey, score);
      return score;
    }

    if (depth === 0) {
      const score = this.evaluateForEngine(game, engineKind, depth, moves);
      searchCache.set(cacheKey, score);
      return score;
    }

    if (game.turn() === 'w') {
      let bestScore = -Infinity;

      for (const move of moves) {
        game.move({
          from: move.from,
          promotion: 'q',
          to: move.to,
        });
        bestScore = Math.max(
          bestScore,
          this.minimax(game, engineKind, depth - 1, alpha, beta, searchCache),
        );
        game.undo();
        alpha = Math.max(alpha, bestScore);

        if (beta <= alpha) {
          break;
        }
      }

      searchCache.set(cacheKey, bestScore);
      return bestScore;
    }

    let bestScore = Infinity;

    for (const move of moves) {
      game.move({
        from: move.from,
        promotion: 'q',
        to: move.to,
      });
      bestScore = Math.min(
        bestScore,
        this.minimax(game, engineKind, depth - 1, alpha, beta, searchCache),
      );
      game.undo();
      beta = Math.min(beta, bestScore);

      if (beta <= alpha) {
        break;
      }
    }

    searchCache.set(cacheKey, bestScore);
    return bestScore;
  }

  private evaluateForEngine(
    game: Chess,
    engineKind: EngineKind,
    depth = 0,
    moves?: Move[],
  ) {
    if (engineKind === 'positional-v1') {
      return this.evaluatePositional(game, depth, moves);
    }

    return this.evaluatePosition(game, depth, moves?.length);
  }

  private evaluatePosition(game: Chess, depth = 0, moveCount?: number) {
    const legalMoveCount = moveCount ?? game.moves().length;

    if (legalMoveCount === 0) {
      if (!game.isCheck()) {
        return 0;
      }

      return game.turn() === 'w'
        ? -checkmateScore - depth
        : checkmateScore + depth;
    }

    if (game.isDraw()) {
      return 0;
    }

    return (
      this.evaluateMaterial(game) +
      legalMoveCount * (game.turn() === 'w' ? 2 : -2) +
      (game.isCheck() ? (game.turn() === 'w' ? -30 : 30) : 0)
    );
  }

  private evaluateMaterial(game: Chess) {
    if (game.isCheckmate()) {
      return game.turn() === 'w' ? -checkmateScore : checkmateScore;
    }

    if (game.isDraw()) {
      return 0;
    }

    let material = 0;
    const board = game.board();

    for (const row of board) {
      for (const piece of row) {
        if (piece) {
          material += pieceValues[piece.type] * (piece.color === 'w' ? 1 : -1);
        }
      }
    }

    return material;
  }

  private evaluatePositional(game: Chess, depth = 0, moves?: Move[]) {
    const legalMoves = moves ?? game.moves({ verbose: true });

    if (legalMoves.length === 0) {
      if (!game.isCheck()) {
        return 0;
      }

      return game.turn() === 'w'
        ? -checkmateScore - depth
        : checkmateScore + depth;
    }

    if (game.isDraw()) {
      return 0;
    }

    let score = 0;
    const board = game.board();
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

    score += legalMoves.length * (game.turn() === 'w' ? 3 : -3);
    score += game.isCheck() ? (game.turn() === 'w' ? -35 : 35) : 0;

    for (const move of legalMoves) {
      if (centerSquares.has(move.to)) {
        score += game.turn() === 'w' ? 4 : -4;
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

  private orderMoves(moves: Move[]) {
    let shouldSort = false;
    const scoredMoves = moves.map((move) => {
      const score =
        (move.captured ? 1000 : 0) +
        (move.promotion ? pieceValues[move.promotion] : 0) +
        (move.san.includes('+') || move.san.includes('#') ? 100 : 0);

      if (score > 0) {
        shouldSort = true;
      }

      return { move, score };
    });

    if (!shouldSort) {
      return moves;
    }

    return scoredMoves
      .sort((a, b) => b.score - a.score)
      .map((scoredMove) => scoredMove.move);
  }

  private async engineId(kind: EngineKind) {
    const name = `Benchmark ${kind}`;
    const engine = await this.prisma.engine.upsert({
      where: { name },
      update: { kind },
      create: { kind, name },
    });

    return engine.id;
  }
}
