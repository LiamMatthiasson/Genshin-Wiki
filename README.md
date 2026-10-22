# Teyvat Codex

A fan-made Genshin Impact wiki and farming planner. It is a plain static site (HTML, CSS and one shared JavaScript file) with no build step and no backend. All game data is loaded live in the browser from public community APIs and cached locally.

## Features

- **Today** (`index.html`): current banners and the materials you can farm today. The game day rolls over at 4:00 AM local time, and Sunday counts as every day.
- **Characters** (`characters/`): every playable character, with a detail page for each (`characters/character.html?id=…`) showing ascension and talent materials, where to gather them, and recommended builds.
- **Weapons** (`weapons/`): the armory, with ascension materials and gathering locations.
- **Artifacts** (`artifacts/`): every artifact set, its bonuses and the domain that drops it.
- **Domains** (`materials/`): the daily domain schedule.
- **My Inventory** (`inventory/`): track the characters, weapons, artifacts and materials you own, and get a farming plan built from them. You can enter items by hand or import a [GOOD](#data-formats) file from an inventory scanner. The inventory is saved only in your browser's `localStorage`, so use Export to keep a backup.

## Running it

There is nothing to install. Serve the folder with any static file server and open it in a browser, for example:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Opening `index.html` directly from disk usually works too, but some browsers restrict `fetch` from `file://` pages, so a local server is more reliable.

An internet connection is required, since all data and images come from the services listed below.

## Project structure

```
index.html              Today: banners and what to farm
characters/index.html   Character list
characters/character.html  Character detail page
weapons/index.html      Weapons
artifacts/index.html    Artifact sets
materials/index.html    Domain schedule
inventory/index.html    Inventory and farming plan
assets/api.js           Shared helpers: data loading, caching, images, inventory, nav bar
assets/style.css        Shared styles
```

### How data loading works

`assets/api.js` handles every network request:

- Responses are cached in `localStorage` (keys prefixed `gi2:`) for 12 hours.
- Requests to the Yatta API go through `politeFetch`, which allows at most 5 requests at a time and retries failed requests up to twice, because the API drops bursts of requests.
- paimon.moe stores its data as JavaScript modules rather than JSON, so the JSON5 parser is loaded on demand to read them.
- Missing images fall back to alternative images, then to a lettered placeholder tile.

## Credits and citations

Teyvat Codex is an unofficial fan project and is not affiliated with or endorsed by HoYoverse. Every external API, dataset, library and asset the site uses is listed below.

### Game data and APIs

| Resource | What it provides | Where it's used |
| --- | --- | --- |
| **Project Amber / Yatta API** (Yatta.moe) — <https://gi.yatta.moe>, API base `https://gi.yatta.moe/api/v2/en` | Characters (`avatar`), weapons (`weapon`), artifact sets (`reliquary`), materials and gathering locations (`material`), and the daily domain schedule (`dailyDungeon`) | `YATTA` in `assets/api.js` |
| **Project Amber / Yatta image assets** — `https://gi.yatta.moe/assets/UI` | Character icons and splash art, weapon, item and artifact icons | `ASSET` in `assets/api.js` |
| **paimon.moe** by MadeBaruna — <https://github.com/MadeBaruna/paimon-moe> (MIT License), read from `https://raw.githubusercontent.com/MadeBaruna/paimon-moe/main/src/data` | Current banners (`banners.js`), recommended builds (`build.js`) and artifact-set IDs (`artifacts/en.json`) | `PAIMON` in `assets/api.js` |
| **genshin-db** by theBowja — <https://github.com/theBowja/genshin-db>, served through **genshin-db-api** — <https://github.com/theBowja/genshin-db-api> (`https://genshin-db-api.vercel.app/api/v5`) | Which domain drops each artifact set | `getArtifactDomains()` in `assets/api.js` |
| **HoYoLAB Teyvat Interactive Map** by HoYoverse — <https://act.hoyolab.com/ys/app/interactive-map/index.html?lang=en-us> | Linked from character and weapon pages for finding gatherable materials (link only, no data is fetched) | `MAP_URL` in `assets/api.js` |

### Libraries

| Library | Use | License |
| --- | --- | --- |
| **JSON5** v2.2.3 — <https://json5.org>, <https://github.com/json5/json5>, loaded from cdnjs (<https://cdnjs.com/libraries/json5>) | Parses paimon.moe's JavaScript data files | MIT |

### Fonts

Both fonts are loaded from **Google Fonts** (<https://fonts.google.com>) via `@import` in `assets/style.css`.

| Font | Designer | License |
| --- | --- | --- |
| **Fredoka** — <https://fonts.google.com/specimen/Fredoka> | Milena Brandão | SIL Open Font License 1.1 |
| **Nunito** — <https://fonts.google.com/specimen/Nunito> | Vernon Adams, Cyreal, Jacques Le Bailly | SIL Open Font License 1.1 |

### Data formats

- **GOOD (Genshin Open Object Description)**, the inventory import/export format, was created by the **Genshin Optimizer** project — <https://github.com/frzyc/genshin-optimizer>, format documentation at <https://frzyc.github.io/genshin-optimizer/#/doc>. Teyvat Codex reads and writes GOOD files but does not include any Genshin Optimizer code.

### Game content

Genshin Impact, its characters, names, artwork, icons and all other game content are trademarks and copyright of **HoYoverse** (COGNOSPHERE PTE. LTD. / miHoYo) — <https://genshin.hoyoverse.com>. The images and data shown on this site come from the community sources above and remain the property of their respective owners.
