# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/internpass/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/internpass/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the protocols that record no token yet by what their launch
would be worth, and shows how to farm each one before it prices.

The model (radar-2.2) reads one sealed snapshot of the protocol universe,
keeps the names that have a real product but no token, and values each one
against the multiples that comparable, already-tokenized protocols trade at —
blending a global multiple with the protocol's own category peers, shrinking
small samples toward the global figure, and pricing the early set at a
discount to the live set. The board carries 200 rows; a further set of live
tokens is carried for comparison, below the board's value floor.

Everything is computed from the snapshot alone: no network, no clock, no
randomness, so the same input always produces the same board.

## Run it

```sh
node main.ts --input <snapshot.json> --output <dir>
```

Node 22, standard library only. `--input` takes the snapshot file or the
directory holding it; `--output` defaults to `MAKEFUN_OUTPUT_DIR` or
`/output`. The run writes `board.json` (the ranked rows), `data.js` (the
same board for the page), a copy of `dashboard/` and `screenshots/`, and
`dossier.json`, the self-audit that recomputes its own numbers and refuses
to pass a board it cannot stand behind.

## The dashboard

Open `dashboard/index.html` in the output directory: a dark sonar board
with the ranked table (search, category filter, pre-token and live tabs,
sortable columns, implied-value bars), the model panel with the formula
and peer multiples, and a detail drawer for every row that recomputes
that row's implied value in the browser and checks it against the number
`board.json` carries.

## Layout

- `main.ts` — the entrypoint: locate, parse, score, refuse, write, mirror, dossier.
- `lib/model.ts` — the radar model: snapshot parsing, peer multiples, the board.
- `vendor/makefun-board.ts` — the dossier builder.
- `dashboard/` — the static page (no build step).
- `screenshots/` — the board, a row's detail drawer, and a filtered view.

---

<sub>Entered on [make.fun](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
