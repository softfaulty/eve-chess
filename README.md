# EvE

engine vs engine.

two backend-controlled chess bots play each other while the frontend watches.
that is the whole ritual.

the backend owns the match state.
the frontend renders the board and tries not to touch the cursed object.

current version: **V3**

V3 is two material-based bots making one-ply decisions with the confidence of a calculator that found a pawn on the floor.

---

## what exists

```txt
frontend/   Vite + React + TypeScript + Chessground
backend/    NestJS + TypeScript + chess.js + Prisma + SQLite
```

no machine learning yet.
no Stockfish yet.

just `chess.js`, an interval, SQLite, and the quiet horror of material evaluation with receipts.

---

## how it works

backend:

- stores one in-memory match
- owns the `chess.js` game
- makes one legal material-based move about every 700ms
- stops when the game ends
- stores engines, games, and moves in SQLite
- stores material evals after moves
- exposes match endpoints

frontend:

- renders one Chessground board
- polls backend state every 500ms
- shows status, turn, move count, material eval, result, and PGN
- shows recent stored games and move history
- does not allow user moves

backend is the source of truth.
frontend is the witness.

---

## run it

install from the repo root:

```bash
bun install
```

start the backend:

```bash
bun run dev:backend
```

backend runs on:

```txt
http://localhost:3001
```

start the frontend in another terminal:

```bash
bun run dev:frontend
```

frontend runs on:

```txt
http://localhost:5173
```

open the frontend, press start, and watch two tiny decision engines generate board trauma.

---

## build

```bash
bun run build:backend
bun run build:frontend
```

if both pass, the machine has accepted the offering.

---

## api

### `GET /match/state`

returns the current match state.

```bash
curl http://localhost:3001/match/state
```

shape:

```json
{
  "fen": "string",
  "pgn": "string",
  "turn": "White",
  "status": "Ready.",
  "moveCount": 0,
  "evalAfter": 0,
  "lastMove": null,
  "isRunning": false,
  "result": null
}
```

### `POST /match/start`

starts autoplay.

```bash
curl -X POST http://localhost:3001/match/start
```

### `POST /match/stop`

stops autoplay without resetting the match.

```bash
curl -X POST http://localhost:3001/match/stop
```

### `POST /match/reset`

resets the match.

```bash
curl -X POST http://localhost:3001/match/reset
```

### `GET /games`

returns recent games, newest first.

```bash
curl http://localhost:3001/games
```

### `GET /games/:id`

returns one game with moves.

```bash
curl http://localhost:3001/games/some-game-id
```

### `GET /engines`

returns known engines.

```bash
curl http://localhost:3001/engines
```

---

## structure

```txt
eve-chess/
├─ backend/
│  ├─ prisma/
│  │  ├─ migrations/
│  │  └─ schema.prisma
│  ├─ src/
│  │  ├─ engines/
│  │  │  ├─ engines.controller.ts
│  │  │  ├─ engines.module.ts
│  │  │  └─ engines.service.ts
│  │  ├─ games/
│  │  │  ├─ games.controller.ts
│  │  │  ├─ games.module.ts
│  │  │  └─ games.service.ts
│  │  ├─ match/
│  │  │  ├─ match.controller.ts
│  │  │  ├─ match.module.ts
│  │  │  └─ match.service.ts
│  │  ├─ prisma/
│  │  │  ├─ prisma.module.ts
│  │  │  └─ prisma.service.ts
│  │  ├─ app.module.ts
│  │  └─ main.ts
│  └─ package.json
│
├─ frontend/
│  ├─ src/
│  │  ├─ App.tsx
│  │  ├─ App.css
│  │  ├─ ChessBoard.tsx
│  │  └─ main.tsx
│  └─ package.json
│
├─ bun.lock
├─ package.json
└─ README.md
```

---

## current state

```txt
version: V3
bots: material-v1, one-ply
live match: in memory
history: SQLite
frontend: read-only board viewer plus recent games
backend: match owner
database: Prisma + SQLite
stockfish: no
machine learning: absolutely not
```

---

## roadmap, probably

V1: random legal move bots.

V2: persist games so every match does not vanish into the ceiling tile. the ceiling tile has been defeated, for now.

V3: material-based evaluation, because apparently the bots should know queens are useful. current version. the bots have discovered arithmetic and immediately made it everyone else's problem.

V4: minimax. the bots begin thinking ahead. horrible for them.

V5: alpha-beta pruning. same thoughts, fewer wasted CPU sighs.

V6: tunable engine weights.

V7: self-play tournaments, because eventually the spreadsheet demands blood.

---

## note

this is not a chess engine yet.

it is a clean little arena where the backend moves pieces legally and the frontend displays the damage.

for V3, that is enough.
