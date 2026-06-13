import { useCallback, useEffect, useRef, useState } from 'react'
import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Key } from '@lichess-org/chessground/types'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.brown.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'

const apiUrl = 'http://localhost:3001/match'
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

type MatchState = {
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

export default function ChessBoard() {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const groundRef = useRef<Api | null>(null)
  const [match, setMatch] = useState<MatchState>({
    fen: startFen,
    isRunning: false,
    lastMove: null,
    moveCount: 0,
    pgn: '',
    result: null,
    status: 'Loading.',
    turn: 'White',
  })

  const loadMatch = useCallback(async (path = 'state') => {
    const response = await fetch(`${apiUrl}/${path}`, {
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

  return (
    <main className="chess-page">
      <section className="chess-shell" aria-label="EvE V1 match viewer">
        <div className="board-wrap">
          <div ref={boardRef} className="chess-board" />
        </div>

        <div className="controls">
          <button type="button" onClick={() => void loadMatch('start')}>
            Start
          </button>
          <button type="button" onClick={() => void loadMatch('stop')}>
            Stop
          </button>
          <button type="button" onClick={() => void loadMatch('reset')}>
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
            <dt>Result</dt>
            <dd>{match.result ?? 'None'}</dd>
          </div>
          <div className="pgn-row">
            <dt>PGN</dt>
            <dd>{match.pgn || 'No moves yet.'}</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
