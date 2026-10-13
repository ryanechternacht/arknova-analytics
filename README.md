# Ark Nova Analytics

Per-round and per-turn analytics for Ark Nova games played on Board Game Arena: points per round, money spent, money carried into each break, break income, cards drawn/snapped/discarded, animals and sponsors played, action usage.

## Running it

```sh
npm install
npm run dev -- --port 5199
```

Open http://localhost:5199, drag the **Ark Nova Analytics** button to your bookmarks bar, then click that bookmark on any boardgamearena.com page while logged in. It reopens the app connected to BGA, lists your recent Ark Nova games, and lets you paste any table link (replay, game review, or table page) or ID.

## How the data gets in

BGA's game logs are only available to a logged-in BGA session (requests need the page's `X-Request-Token`), so the app can't fetch them itself. The bookmarklet (`src/bridge/bookmarklet.ts`) runs on boardgamearena.com, opens the app, and answers `postMessage` requests from it:

| Request | BGA endpoint |
| --- | --- |
| Unlock an archived table | `/gamereview/gamereview/requestTableArchive.html?table=ID` |
| Full notification log | `/archive/archive/logs.html?table=ID&translated=true` |
| Table metadata (players, scores, game) | `/table/table/tableinfos.html?id=ID` |
| Your recent Ark Nova games | `/gamestats/gamestats/getGames.html?player=ME&game_id=1741&page=N` |

You can also drop a game `.json` file onto the page (the "Download game data" button saves one).

## What's in a BGA log

`logs.html` returns the same notification packets the replay plays back: one public channel (`/table/t…`) with every move, plus each player's private channel (`/player/p…`) with card names drawn and discarded. Useful notifications:

- `gameStateChange` id 7 starts a player's turn; `startBreak` / `finishBreak` bracket breaks; id 98 is final scoring.
- `chooseActionCard`: action, level, strength. A turn ending with no `chooseActionCard` used the card for an X-token.
- `getBonuses`: money / appeal / conservation / reputation / X-token changes with a source, plus the player's running BGA `score`.
- `buyAnimal`, `buyBuilding`: cost and the player's money `total` afterwards (used to verify the money ledger).
- `drawCards`, `snapCard`, `discardCards` (the log template tells deck draw vs snap vs take-in-range, sell vs discard vs pouch), `playSponsor`, `donation`, `releaseAnimal`, `pilferingMoney`, `finalScoring`.

`src/lib/parse.ts` turns this into turns, breaks, rounds, and per-player stats. It cross-checks its money ledger against every BGA `total` and its appeal/conservation against final scoring; mismatches show under "Data checks" on the game page.

## Definitions

- **Points** = appeal + 3 × conservation. BGA (and the printed board) count the first 10 CP as 2 each; we count every CP as 3 so per-round gains are comparable. It's derived from BGA's running score, so it's always consistent with BGA: `points = score + 14 + min(CP, 10)`.
- **Round** = from one break to the next (Ark Nova has no fixed rounds). Final-scoring points are shown separately.
- **Money carried into break** = money on hand when the break starts, before income.

## Scripts

- `npx tsx scripts/analyze.ts game.json` prints a text summary of a downloaded game (`--json out.json` writes the full analysis).
- `node scripts/extract-cards.mjs path/to/cardsData.js` regenerates `src/data/cards.json` from BGA's Ark Nova `cardsData.js` (card names, cost, appeal, tags).
