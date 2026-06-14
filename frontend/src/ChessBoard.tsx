import { useCallback, useEffect, useRef, useState } from 'react'
import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Key } from '@lichess-org/chessground/types'
import { io } from 'socket.io-client'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.brown.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'

const apiBaseUrl = 'http://127.0.0.1:3001'
const socketUrl = 'http://127.0.0.1:3001'
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

type EngineKind =
  | 'random-v1'
  | 'material-v1'
  | 'minimax-v1'
  | 'minimax-v2'
  | 'positional-v1'
type BenchmarkEngine = 'random' | 'material' | 'minimax' | 'positional'

type MatchState = {
  blackEngineKind: EngineKind
  engineOptions: {
    kind: EngineKind
    name: string
  }[]
  evalAfter: number
  fen: string
  isRunning: boolean
  lastMove: {
    from: string
    san: string
    to: string
  } | null
  moveCount: number
  pgn: string
  result: string | null
  status: string
  turn: 'White' | 'Black'
  whiteEngineKind: EngineKind
}

type GameSummary = {
  id: string
  endedAt: string | null
  moveCount: number
  result: string | null
  startedAt: string
  status: string
}

type GameDetail = GameSummary & {
  moves: {
    evalAfter: number | null
    fenAfter: string
    from: string
    id: string
    ply: number
    san: string
    to: string
  }[]
  pgn: string | null
}

type BenchmarkState = {
  averagePlyCount: number
  blackEngine: BenchmarkEngine
  completedGames: number
  currentGameId: string | null
  draws: number
  endedAt: string | null
  fen: string
  isBenchmarkRunning: boolean
  lastMove: {
    from: string
    san: string
    to: string
  } | null
  startedAt: string | null
  totalGames: number
  turn: 'White' | 'Black'
  whiteEngine: BenchmarkEngine
  winsBlack: number
  winsWhite: number
}

type BenchmarkSummary = BenchmarkState & {
  id: string
  swapColors: boolean
}

type BenchmarkDetail = BenchmarkSummary & {
  games: {
    blackEngine: {
      kind: string
      name: string
    }
    id: string
    moveCount: number
    result: string | null
    startedAt: string
    status: string
    whiteEngine: {
      kind: string
      name: string
    }
  }[]
}

const benchmarkEngines: { kind: BenchmarkEngine; name: string }[] = [
  { kind: 'random', name: 'Random' },
  { kind: 'material', name: 'Material' },
  { kind: 'minimax', name: 'Minimax' },
  { kind: 'positional', name: 'Positional' },
]

export default function ChessBoard() {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const groundRef = useRef<Api | null>(null)
  const [benchmarkBlack, setBenchmarkBlack] =
    useState<BenchmarkEngine>('minimax')
  const [benchmarkGames, setBenchmarkGames] = useState<10 | 50 | 100>(10)
  const [benchmarkState, setBenchmarkState] = useState<BenchmarkState>({
    averagePlyCount: 0,
    blackEngine: 'minimax',
    completedGames: 0,
    currentGameId: null,
    draws: 0,
    endedAt: null,
    fen: startFen,
    isBenchmarkRunning: false,
    lastMove: null,
    startedAt: null,
    totalGames: 0,
    turn: 'White',
    whiteEngine: 'positional',
    winsBlack: 0,
    winsWhite: 0,
  })
  const [benchmarkWhite, setBenchmarkWhite] =
    useState<BenchmarkEngine>('positional')
  const [benchmarks, setBenchmarks] = useState<BenchmarkSummary[]>([])
  const [games, setGames] = useState<GameSummary[]>([])
  const [match, setMatch] = useState<MatchState>({
    blackEngineKind: 'minimax-v2',
    engineOptions: [
      { kind: 'random-v1', name: 'Random v1' },
      { kind: 'material-v1', name: 'Material v1' },
      { kind: 'minimax-v1', name: 'Minimax 1' },
      { kind: 'minimax-v2', name: 'Minimax 2' },
      { kind: 'positional-v1', name: 'Positional v1' },
    ],
    evalAfter: 0,
    fen: startFen,
    isRunning: false,
    lastMove: null,
    moveCount: 0,
    pgn: '',
    result: null,
    status: 'Loading.',
    turn: 'White',
    whiteEngineKind: 'minimax-v2',
  })
  const [selectedBenchmark, setSelectedBenchmark] =
    useState<BenchmarkDetail | null>(null)
  const [selectedGame, setSelectedGame] = useState<GameDetail | null>(null)
  const [swapBenchmarkColors, setSwapBenchmarkColors] = useState(true)

  const setMatchState = useCallback((nextMatch: MatchState) => {
    groundRef.current?.set({
      fen: nextMatch.fen,
      lastMove: nextMatch.lastMove
        ? ([nextMatch.lastMove.from, nextMatch.lastMove.to] as Key[])
        : undefined,
      movable: {
        color: undefined,
        free: false,
      },
      turnColor: nextMatch.turn === 'White' ? 'white' : 'black',
      viewOnly: true,
    })

    setMatch(nextMatch)
  }, [])

  const loadMatch = useCallback(async (path = 'state') => {
    try {
      const response = await fetch(`${apiBaseUrl}/match/${path}`, {
        method: path === 'state' ? 'GET' : 'POST',
      })
      await response.json()
    } catch {
      return
    }
  }, [])

  const setEngine = useCallback(async (side: 'white' | 'black', kind: EngineKind) => {
    try {
      const response = await fetch(`${apiBaseUrl}/match/engine`, {
        body: JSON.stringify({ kind, side }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      setMatchState((await response.json()) as MatchState)
    } catch {
      return
    }
  }, [setMatchState])

  const loadGames = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/games`)
      setGames((await response.json()) as GameSummary[])
    } catch {
      return
    }
  }, [])

  const loadBenchmarkState = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/benchmark/state`)
      const nextBenchmarkState = (await response.json()) as BenchmarkState

      if (nextBenchmarkState.isBenchmarkRunning) {
        groundRef.current?.set({
          fen: nextBenchmarkState.fen,
          lastMove: nextBenchmarkState.lastMove
            ? ([
                nextBenchmarkState.lastMove.from,
                nextBenchmarkState.lastMove.to,
              ] as Key[])
            : undefined,
          movable: {
            color: undefined,
            free: false,
          },
          turnColor: nextBenchmarkState.turn === 'White' ? 'white' : 'black',
          viewOnly: true,
        })
      }

      setBenchmarkState(nextBenchmarkState)
    } catch {
      return
    }
  }, [])

  const loadBenchmarks = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/benchmarks`)
      setBenchmarks((await response.json()) as BenchmarkSummary[])
    } catch {
      return
    }
  }, [])

  const loadBenchmark = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/benchmarks/${id}`)
      setSelectedBenchmark((await response.json()) as BenchmarkDetail)
    } catch {
      return
    }
  }, [])

  const startBenchmark = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/benchmark/start`, {
        body: JSON.stringify({
          black: benchmarkBlack,
          games: benchmarkGames,
          swapColors: swapBenchmarkColors,
          white: benchmarkWhite,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      setBenchmarkState((await response.json()) as BenchmarkState)
      void loadBenchmarks()
    } catch {
      return
    }
  }, [
    benchmarkBlack,
    benchmarkGames,
    benchmarkWhite,
    loadBenchmarks,
    swapBenchmarkColors,
  ])

  const stopBenchmark = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/benchmark/stop`, {
        method: 'POST',
      })

      setBenchmarkState((await response.json()) as BenchmarkState)
      void loadBenchmarks()
    } catch {
      return
    }
  }, [loadBenchmarks])

  const loadGame = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/games/${id}`)
      setSelectedGame((await response.json()) as GameDetail)
    } catch {
      return
    }
  }, [])

  useEffect(() => {
    if (!boardRef.current) {
      return
    }

    groundRef.current = Chessground(boardRef.current, {
      coordinates: true,
      fen: startFen,
      highlight: {
        lastMove: true,
      },
      movable: {
        color: undefined,
        free: false,
      },
      viewOnly: true,
    })

    return () => {
      groundRef.current?.destroy()
      groundRef.current = null
    }
  }, [])

  useEffect(() => {
    const socket = io(socketUrl, {
      transports: ['websocket'],
    })

    socket.on('match/state', (nextMatch: MatchState) => {
      if (!benchmarkState.isBenchmarkRunning) {
        setMatchState(nextMatch)
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [benchmarkState.isBenchmarkRunning, setMatchState])

  useEffect(() => {
    const firstLoad = setTimeout(() => {
      void loadGames()
    }, 0)
    const interval = setInterval(() => {
      void loadGames()
    }, 2000)

    return () => {
      clearTimeout(firstLoad)
      clearInterval(interval)
    }
  }, [loadGames])

  useEffect(() => {
    const firstLoad = setTimeout(() => {
      void loadBenchmarkState()
      void loadBenchmarks()
    }, 0)
    const interval = setInterval(() => {
      void loadBenchmarkState()
      void loadBenchmarks()
    }, benchmarkState.isBenchmarkRunning ? 150 : 1000)

    return () => {
      clearTimeout(firstLoad)
      clearInterval(interval)
    }
  }, [benchmarkState.isBenchmarkRunning, loadBenchmarkState, loadBenchmarks])

  return (
    <main className="chess-page">
      <section className="chess-shell" aria-label="EvE V3 match viewer">
        <div className="live-match">
          <div className="board-wrap">
            <div ref={boardRef} className="chess-board" />
          </div>

          <div className="controls">
            <button
              type="button"
              onClick={() => {
                void loadMatch('start')
                void loadGames()
              }}
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => {
                void loadMatch('stop')
                void loadGames()
              }}
            >
              Stop
            </button>
            <button
              type="button"
              onClick={() => {
                void loadMatch('reset')
                void loadGames()
              }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => groundRef.current?.toggleOrientation()}
            >
              Flip board
            </button>
          </div>

          <div className="engine-controls">
            <label>
              <span>White</span>
              <select
                value={match.whiteEngineKind}
                onChange={(event) => {
                  void setEngine('white', event.target.value as EngineKind)
                }}
              >
                {match.engineOptions.map((engine) => (
                  <option key={engine.kind} value={engine.kind}>
                    {engine.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Black</span>
              <select
                value={match.blackEngineKind}
                onChange={(event) => {
                  void setEngine('black', event.target.value as EngineKind)
                }}
              >
                {match.engineOptions.map((engine) => (
                  <option key={engine.kind} value={engine.kind}>
                    {engine.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <dl className="game-info">
            <div>
              <dt>Status</dt>
              <dd>{match.status}</dd>
            </div>
            <div>
              <dt>Turn</dt>
              <dd>{match.turn}</dd>
            </div>
            <div>
              <dt>Move count</dt>
              <dd>{match.moveCount}</dd>
            </div>
            <div>
              <dt>Material eval</dt>
              <dd>{match.evalAfter}</dd>
            </div>
            <div>
              <dt>Result</dt>
              <dd>{match.result ?? 'None'}</dd>
            </div>
            <div className="pgn-row">
              <dt>Live PGN</dt>
              <dd>{match.pgn || 'No moves yet.'}</dd>
            </div>
          </dl>
        </div>

        <aside className="history-panel" aria-label="Recent games">
          <h2>Recent Games</h2>

          <div className="game-list">
            {games.length === 0 ? (
              <p>No stored games yet.</p>
            ) : (
              games.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => void loadGame(game.id)}
                >
                  <span>{game.result ?? 'In progress'}</span>
                  <span>{game.status}</span>
                  <span>{game.moveCount} moves</span>
                  <span>
                    {new Date(game.startedAt).toLocaleString()} /{' '}
                    {game.endedAt
                      ? new Date(game.endedAt).toLocaleString()
                      : 'still running'}
                  </span>
                </button>
              ))
            )}
          </div>

          <section className="benchmark-panel" aria-label="Benchmark mode">
            <h2>Benchmark</h2>

            <div className="engine-controls">
              <label>
                <span>White</span>
                <select
                  value={benchmarkWhite}
                  onChange={(event) => {
                    setBenchmarkWhite(event.target.value as BenchmarkEngine)
                  }}
                >
                  {benchmarkEngines.map((engine) => (
                    <option key={engine.kind} value={engine.kind}>
                      {engine.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Black</span>
                <select
                  value={benchmarkBlack}
                  onChange={(event) => {
                    setBenchmarkBlack(event.target.value as BenchmarkEngine)
                  }}
                >
                  {benchmarkEngines.map((engine) => (
                    <option key={engine.kind} value={engine.kind}>
                      {engine.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Games</span>
                <select
                  value={benchmarkGames}
                  onChange={(event) => {
                    setBenchmarkGames(
                      Number(event.target.value) as 10 | 50 | 100,
                    )
                  }}
                >
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>

              <label className="check-row">
                <input
                  checked={swapBenchmarkColors}
                  type="checkbox"
                  onChange={(event) => {
                    setSwapBenchmarkColors(event.target.checked)
                  }}
                />
                <span>Swap colors</span>
              </label>
            </div>

            <div className="controls">
              <button type="button" onClick={() => void startBenchmark()}>
                Start benchmark
              </button>
              <button type="button" onClick={() => void stopBenchmark()}>
                Stop benchmark
              </button>
            </div>

            <dl className="game-info">
              <div>
                <dt>Status</dt>
                <dd>
                  {benchmarkState.isBenchmarkRunning ? 'Running' : 'Stopped'}
                </dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>
                  {benchmarkState.completedGames} / {benchmarkState.totalGames}
                </dd>
              </div>
              <div>
                <dt>White wins</dt>
                <dd>{benchmarkState.winsWhite}</dd>
              </div>
              <div>
                <dt>Black wins</dt>
                <dd>{benchmarkState.winsBlack}</dd>
              </div>
              <div>
                <dt>Draws</dt>
                <dd>{benchmarkState.draws}</dd>
              </div>
              <div>
                <dt>Average ply</dt>
                <dd>{benchmarkState.averagePlyCount.toFixed(1)}</dd>
              </div>
            </dl>

            <h2>Recent Benchmarks</h2>
            <div className="game-list">
              {benchmarks.length === 0 ? (
                <p>No benchmark runs yet.</p>
              ) : (
                benchmarks.map((benchmark) => (
                  <button
                    key={benchmark.id}
                    type="button"
                    onClick={() => void loadBenchmark(benchmark.id)}
                  >
                    <span>
                      {benchmark.whiteEngine} vs {benchmark.blackEngine}
                    </span>
                    <span>
                      {benchmark.completedGames} / {benchmark.totalGames} games
                    </span>
                    <span>
                      W {benchmark.winsWhite} / B {benchmark.winsBlack} / D{' '}
                      {benchmark.draws}
                    </span>
                    <span>avg ply {benchmark.averagePlyCount.toFixed(1)}</span>
                  </button>
                ))
              )}
            </div>

            {selectedBenchmark ? (
              <div className="selected-game">
                <h2>Benchmark Detail</h2>
                <dl className="game-info">
                  <div>
                    <dt>Engines</dt>
                    <dd>
                      {selectedBenchmark.whiteEngine} vs{' '}
                      {selectedBenchmark.blackEngine}
                    </dd>
                  </div>
                  <div>
                    <dt>Score</dt>
                    <dd>
                      W {selectedBenchmark.winsWhite} / B{' '}
                      {selectedBenchmark.winsBlack} / D{' '}
                      {selectedBenchmark.draws}
                    </dd>
                  </div>
                  <div>
                    <dt>Completed</dt>
                    <dd>
                      {selectedBenchmark.completedGames} /{' '}
                      {selectedBenchmark.totalGames}
                    </dd>
                  </div>
                  <div>
                    <dt>Average ply</dt>
                    <dd>{selectedBenchmark.averagePlyCount.toFixed(1)}</dd>
                  </div>
                </dl>

                <div className="game-list">
                  {selectedBenchmark.games.map((game) => (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => void loadGame(game.id)}
                    >
                      <span>{game.result ?? 'In progress'}</span>
                      <span>
                        {game.whiteEngine.name} vs {game.blackEngine.name}
                      </span>
                      <span>{game.status}</span>
                      <span>{game.moveCount} moves</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {selectedGame ? (
            <div className="selected-game">
              <h2>Game Detail</h2>
              <dl className="game-info">
                <div>
                  <dt>Result</dt>
                  <dd>{selectedGame.result ?? 'None'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selectedGame.status}</dd>
                </div>
                <div>
                  <dt>Move count</dt>
                  <dd>{selectedGame.moveCount}</dd>
                </div>
                <div className="pgn-row">
                  <dt>PGN</dt>
                  <dd>{selectedGame.pgn || 'No PGN.'}</dd>
                </div>
              </dl>
              <ol className="move-list">
                {selectedGame.moves.map((move) => (
                  <li key={move.id}>
                    {move.ply}. {move.san} ({move.from}-{move.to})
                    {move.evalAfter === null ? '' : ` eval ${move.evalAfter}`}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  )
}
