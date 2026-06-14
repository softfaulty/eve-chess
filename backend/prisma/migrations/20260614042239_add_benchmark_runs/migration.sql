-- CreateTable
CREATE TABLE "BenchmarkRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "whiteEngine" TEXT NOT NULL,
    "blackEngine" TEXT NOT NULL,
    "totalGames" INTEGER NOT NULL,
    "completedGames" INTEGER NOT NULL DEFAULT 0,
    "winsWhite" INTEGER NOT NULL DEFAULT 0,
    "winsBlack" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "averagePlyCount" REAL NOT NULL DEFAULT 0,
    "swapColors" BOOLEAN NOT NULL DEFAULT false,
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "benchmarkId" TEXT,
    "whiteEngineId" TEXT NOT NULL,
    "blackEngineId" TEXT NOT NULL,
    "result" TEXT,
    "status" TEXT NOT NULL,
    "finalFen" TEXT,
    "pgn" TEXT,
    "moveCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "Game_whiteEngineId_fkey" FOREIGN KEY ("whiteEngineId") REFERENCES "Engine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Game_blackEngineId_fkey" FOREIGN KEY ("blackEngineId") REFERENCES "Engine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Game_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "BenchmarkRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("blackEngineId", "endedAt", "finalFen", "id", "moveCount", "pgn", "result", "startedAt", "status", "whiteEngineId") SELECT "blackEngineId", "endedAt", "finalFen", "id", "moveCount", "pgn", "result", "startedAt", "status", "whiteEngineId" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
