import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Color, Dests, Key } from '@lichess-org/chessground/types'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.brown.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'

const startingFen = new Chess().fen()

function turnColor(game: Chess): Color {
  return game.turn() === 'w' ? 'white' : 'black'
}

function toDests(game: Chess): Dests {
  const dests: Dests = new Map()

  for (const move of game.moves({ verbose: true })) {
    const from = move.from as Key
    const to = move.to as Key
    const targets = dests.get(from)

    if (targets) {
      targets.push(to)
    } else {
      dests.set(from, [to])
    }
  }

  return dests
}

export default function ChessBoard() {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const groundRef = useRef<Api | null>(null)
  const gameRef = useRef(new Chess())
  const lastMoveRef = useRef<Key[] | undefined>(undefined)
  const [position, setPosition] = useState({
    fen: startingFen,
    status: 'Game in progress.',
    turn: 'White',
  })

  const syncBoard = () => {
    const game = gameRef.current
    const color = turnColor(game)
    const status = game.isCheckmate()
      ? `Checkmate. ${game.turn() === 'w' ? 'Black' : 'White'} wins.`
      : game.isStalemate()
        ? 'Draw by stalemate.'
        : game.isDraw()
          ? 'Draw.'
          : game.isCheck()
            ? `${game.turn() === 'w' ? 'White' : 'Black'} is in check.`
            : 'Game in progress.'

    groundRef.current?.set({
      fen: game.fen(),
      turnColor: color,
      check: game.isCheck() ? color : false,
      lastMove: lastMoveRef.current,
      movable: {
        color: game.isGameOver() ? undefined : color,
        dests: game.isGameOver() ? new Map() : toDests(game),
        free: false,
        showDests: true,
        rookCastle: false,
      },
    })

    setPosition({
      fen: game.fen(),
      status,
      turn: game.turn() === 'w' ? 'White' : 'Black',
    })
  }

  useEffect(() => {
    if (!boardRef.current) {
      return
    }

    groundRef.current = Chessground(boardRef.current, {
      fen: gameRef.current.fen(),
      turnColor: turnColor(gameRef.current),
      coordinates: true,
      highlight: {
        check: true,
        lastMove: true,
      },
      animation: {
        enabled: true,
        duration: 150,
      },
      movable: {
        color: turnColor(gameRef.current),
        dests: toDests(gameRef.current),
        free: false,
        showDests: true,
        rookCastle: false,
        events: {
          after: (from, to) => {
            const game = gameRef.current
            let move

            try {
              move = game.move({ from, to, promotion: 'q' })
            } catch {
              syncBoard()
              return
            }

            if (!move) {
              syncBoard()
              return
            }

            lastMoveRef.current = [from, to]
            syncBoard()
          },
        },
      },
    })

    return () => {
      groundRef.current?.destroy()
      groundRef.current = null
    }
  }, [])

  return (
    <main className="chess-page">
      <section className="chess-shell" aria-label="Playable chess board">
        <div className="board-wrap">
          <div ref={boardRef} className="chess-board" />
        </div>

        <div className="controls">
          <button
            type="button"
            onClick={() => {
              gameRef.current.reset()
              lastMoveRef.current = undefined
              syncBoard()
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
            <dt>Turn</dt>
            <dd>{position.turn}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{position.status}</dd>
          </div>
          <div className="fen-row">
            <dt>FEN</dt>
            <dd>{position.fen}</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
