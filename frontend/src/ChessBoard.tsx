import { useCallback, useEffect, useRef, useState } from 'react'
import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Key } from '@lichess-org/chessground/types'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.brown.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'

const apiBaseUrl = 'http://localhost:3001'
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

type MatchState = {
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

export default function ChessBoard() {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const groundRef = useRef<Api | null>(null)
  const [games, setGames] = useState<GameSummary[]>([])
  const [match, setMatch] = useState<MatchState>({
    evalAfter: 0,
    fen: startFen,
    isRunning: false,
    lastMove: null,
    moveCount: 0,
    pgn: '',
    result: null,
    status: 'Loading.',
    turn: 'White',
  })
  const [selectedGame, setSelectedGame] = useState<GameDetail | null>(null)

  const loadMatch = useCallback(async (path = 'state') => {
    const response = await fetch(`${apiBaseUrl}/match/${path}`, {
      method: path === 'state' ? 'GET' : 'POST',
    })
    const nextMatch = (await response.json()) as MatchState

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

  const loadGames = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/games`)
    setGames((await response.json()) as GameSummary[])
  }, [])

  const loadGame = useCallback(async (id: string) => {
    const response = await fetch(`${apiBaseUrl}/games/${id}`)
    setSelectedGame((await response.json()) as GameDetail)
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
    const firstLoad = setTimeout(() => {
      void loadMatch()
    }, 0)
    const interval = setInterval(() => {
      void loadMatch()
    }, 500)

    return () => {
      clearTimeout(firstLoad)
      clearInterval(interval)
    }
  }, [loadMatch])

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
