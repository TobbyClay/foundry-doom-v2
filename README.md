# FoundryDOOM v2 (source-only)

> This repository intentionally contains only the module source. It excludes all DOOM game files, WADs, generated `.jsdos` bundles, and vendored js-dos runtime assets. It is a technical portfolio artifact, not a standalone playable distribution.

FoundryDOOM v2 opens the bundled DOS DOOM session in a Foundry VTT window.

This package is separate from the existing `foundry-doom` module. Its package id and folder name are both `foundry-doom-v2`; the display title is `FoundryDOOM v2`.

## Use

- Enable `FoundryDOOM v2` in your world.
- Use the skull scene-control button, or run a Script macro with `launchFoundryDoomV2()`.
- GMs can click the players button in the DOOM toolbar, or call `game.foundryDoomV2.showToPlayers()`, to ask connected clients to open their own DOOM window.

## API

```js
game.foundryDoomV2.open();
game.foundryDoomV2.focus();
game.foundryDoomV2.reload();
game.foundryDoomV2.close();
game.foundryDoomV2.showToPlayers();
```

The same API is exposed as `game.modules.get("foundry-doom-v2").api`.

## Bundle

The module's default bundle path is:

```text
bundle/foundry-doom-v2.jsdos
```

That file is deliberately not included in this repository. Supply a bundle only when you have the necessary rights to distribute its contents to connected players.

You can point the module at another permitted `.jsdos` bundle from Configure Settings under `FoundryDOOM v2`.
