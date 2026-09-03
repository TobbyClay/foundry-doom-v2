const MODULE_ID = "foundry-doom-v2";
const MODULE_TITLE = "FoundryDOOM v2";
const TOOL_NAME = "foundryDoomV2";
const SOCKET_NAME = `module.${MODULE_ID}`;
const WINDOW_ID = "foundry-doom-v2-player";
const DEFAULT_BUNDLE_PATH = "bundle/foundry-doom-v2.jsdos";
const TEMPLATE_PATH = new URL("../templates/doom-window.hbs", import.meta.url).href;
const PLAYER_URL = new URL("../doom.html", import.meta.url).href;

const SETTINGS = Object.freeze({
  bundlePath: "bundlePath",
  showSceneControl: "showSceneControl",
  windowWidth: "windowWidth",
  windowHeight: "windowHeight",
  volume: "volume",
  mouseSensitivity: "mouseSensitivity",
  autoFocus: "autoFocus",
  workerThread: "workerThread",
});

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class FoundryDoomV2App extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: WINDOW_ID,
    classes: ["foundry-doom-v2-app"],
    window: {
      title: MODULE_TITLE,
      icon: "fa-solid fa-skull",
      resizable: true,
    },
    position: {
      width: 1060,
      height: 780,
    },
  };

  static PARTS = {
    body: { template: TEMPLATE_PATH },
  };

  #positionApplied = false;
  #messageHandler = (event) => this.#onFrameMessage(event);

  static open() {
    if (!FoundryDoomV2App.instance) FoundryDoomV2App.instance = new FoundryDoomV2App();
    FoundryDoomV2App.instance.render({ force: true });
    return FoundryDoomV2App.instance;
  }

  static broadcastOpen() {
    if (!game.user?.isGM) {
      ui.notifications.warn(`${MODULE_TITLE} can only be broadcast by a GM.`);
      return false;
    }

    game.socket.emit(SOCKET_NAME, {
      action: "open",
      sender: game.user.id,
      timestamp: Date.now(),
    });
    ui.notifications.info(`${MODULE_TITLE} launch sent to connected players.`);
    return true;
  }

  async _prepareContext() {
    return {
      canBroadcast: game.user?.isGM ?? false,
      iframeSrc: this.#buildPlayerUrl(),
      moduleTitle: MODULE_TITLE,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    window.addEventListener("message", this.#messageHandler);
    this.#applyConfiguredPosition();
    this.#wireControls();
    this.#setStatus("Starting runtime");

    const frame = this.#frame;
    frame?.addEventListener(
      "load",
      () => {
        if (getSetting(SETTINGS.autoFocus, true)) window.setTimeout(() => this.focusGame(), 150);
      },
      { once: true },
    );
  }

  async close(options = {}) {
    window.removeEventListener("message", this.#messageHandler);
    this.#stopGame();
    FoundryDoomV2App.instance = null;
    return super.close(options);
  }

  focusGame() {
    const frame = this.#frame;
    if (!frame) return;

    frame.focus({ preventScroll: true });
    frame.contentWindow?.focus();
    this.#postToFrame("focus");
  }

  reloadGame() {
    const frame = this.#frame;
    if (!frame) return;

    this.#setStatus("Reloading");
    frame.src = this.#buildPlayerUrl({ reload: Date.now().toString() });
  }

  popOutGame() {
    const opened = window.open(this.#buildPlayerUrl({ popout: "1" }), "_blank");
    if (!opened) {
      ui.notifications.warn("Your browser blocked the DOOM pop-out window.");
      return;
    }

    opened.opener = null;
  }

  async toggleFullscreen() {
    const target = this.#frame ?? this.element;
    if (!target?.requestFullscreen) {
      ui.notifications.warn("Fullscreen is not available in this browser.");
      return;
    }

    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen();
      this.focusGame();
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to toggle fullscreen`, error);
      ui.notifications.warn("Fullscreen request was blocked by the browser.");
    }
  }

  #wireControls() {
    for (const button of this.element?.querySelectorAll("[data-doom-action]") ?? []) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this.#handleAction(button.dataset.doomAction);
      });
    }
  }

  #handleAction(action) {
    switch (action) {
      case "focus":
        return this.focusGame();
      case "reload":
        return this.reloadGame();
      case "popout":
        return this.popOutGame();
      case "fullscreen":
        return this.toggleFullscreen();
      case "broadcast":
        return FoundryDoomV2App.broadcastOpen();
      default:
        return undefined;
    }
  }

  #applyConfiguredPosition() {
    if (this.#positionApplied) return;

    const width = clampNumber(getSetting(SETTINGS.windowWidth, 1060), 720, 1920, 1060);
    const height = clampNumber(getSetting(SETTINGS.windowHeight, 780), 520, 1200, 780);
    this.setPosition({ width, height });
    this.#positionApplied = true;
  }

  #buildPlayerUrl(extraParams = {}) {
    const url = new URL(PLAYER_URL);
    const moduleVersion = game.modules.get(MODULE_ID)?.version ?? "dev";

    url.searchParams.set("moduleVersion", moduleVersion);
    url.searchParams.set("bundle", normalizeBundlePath(getSetting(SETTINGS.bundlePath, DEFAULT_BUNDLE_PATH)));
    url.searchParams.set("volume", String(clampNumber(getSetting(SETTINGS.volume, 80), 0, 100, 80)));
    url.searchParams.set("mouseSensitivity", String(clampNumber(getSetting(SETTINGS.mouseSensitivity, 50), 10, 200, 50)));
    url.searchParams.set("workerThread", getSetting(SETTINGS.workerThread, true) ? "1" : "0");

    for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, value);
    return url.href;
  }

  #postToFrame(type, data = {}) {
    const frame = this.#frame;
    try {
      frame?.contentWindow?.postMessage({ foundryDoomV2: { type, ...data } }, window.location.origin);
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to post message to DOOM iframe`, error);
    }
  }

  #onFrameMessage(event) {
    if (event.origin !== window.location.origin) return;

    const payload = event.data?.foundryDoomV2;
    if (!payload || typeof payload !== "object") return;

    if (payload.type === "ready") {
      this.#setStatus("Running");
      if (getSetting(SETTINGS.autoFocus, true)) window.setTimeout(() => this.focusGame(), 50);
      return;
    }

    if (payload.type === "status") {
      this.#setStatus(payload.message ?? "", payload.tone ?? "");
      return;
    }

    if (payload.type === "error") {
      const message = payload.message ?? "Failed to start DOOM.";
      this.#setStatus("Error", "error");
      ui.notifications.error(`${MODULE_TITLE}: ${message}`);
    }
  }

  #setStatus(message, tone = "") {
    const status = this.element?.querySelector("[data-doom-status]");
    if (!status) return;

    status.textContent = message;
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  }

  #stopGame() {
    const frame = this.#frame;
    try {
      this.#postToFrame("stop");
      if (frame) frame.src = "about:blank";
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to stop DOOM iframe cleanly`, error);
    }
  }

  get #frame() {
    return this.element?.querySelector("[data-doom-frame]") ?? null;
  }
}

function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.bundlePath, {
    name: "Bundle path",
    hint: "Path to the .jsdos bundle, relative to this module folder unless an absolute URL is provided.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_BUNDLE_PATH,
  });

  game.settings.register(MODULE_ID, SETTINGS.showSceneControl, {
    name: "Show scene control",
    hint: "Adds a skull button to the scene controls that opens FoundryDOOM v2.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.windowWidth, {
    name: "Window width",
    hint: "Initial FoundryDOOM v2 window width in pixels.",
    scope: "client",
    config: true,
    type: Number,
    default: 1060,
    range: { min: 720, max: 1920, step: 20 },
  });

  game.settings.register(MODULE_ID, SETTINGS.windowHeight, {
    name: "Window height",
    hint: "Initial FoundryDOOM v2 window height in pixels.",
    scope: "client",
    config: true,
    type: Number,
    default: 780,
    range: { min: 520, max: 1200, step: 20 },
  });

  game.settings.register(MODULE_ID, SETTINGS.volume, {
    name: "Volume",
    hint: "Initial js-dos volume from 0 to 100.",
    scope: "client",
    config: true,
    type: Number,
    default: 80,
    range: { min: 0, max: 100, step: 5 },
  });

  game.settings.register(MODULE_ID, SETTINGS.mouseSensitivity, {
    name: "Mouse sensitivity",
    hint: "Initial js-dos mouse sensitivity, where 50 is the default.",
    scope: "client",
    config: true,
    type: Number,
    default: 50,
    range: { min: 10, max: 200, step: 5 },
  });

  game.settings.register(MODULE_ID, SETTINGS.autoFocus, {
    name: "Auto-focus game",
    hint: "Focuses the DOOM iframe when the player page reports ready.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.workerThread, {
    name: "Use worker thread",
    hint: "Runs the DOS emulator in a worker thread when supported by the browser.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });
}

function addSceneControl(controls) {
  if (!getSetting(SETTINGS.showSceneControl, true)) return;

  if (Array.isArray(controls)) {
    addLegacySceneControl(controls);
    return;
  }

  const control = controls.tokens ?? controls.token ?? Object.values(controls).find((candidate) => candidate?.tools);
  if (!control?.tools) return;

  if (Array.isArray(control.tools)) {
    addToolToArray(control.tools);
    return;
  }

  if (control.tools[TOOL_NAME]) return;
  control.tools[TOOL_NAME] = {
    name: TOOL_NAME,
    title: MODULE_TITLE,
    icon: "fa-solid fa-skull",
    order: Object.keys(control.tools).length,
    button: true,
    visible: true,
    onChange: () => FoundryDoomV2App.open(),
  };
}

function addLegacySceneControl(controls) {
  const control = controls.find((candidate) => candidate.name === "token") ?? controls.find((candidate) => candidate.tools);
  if (!control?.tools) return;
  addToolToArray(control.tools);
}

function addToolToArray(tools) {
  if (tools.some((tool) => tool.name === TOOL_NAME)) return;
  tools.push({
    name: TOOL_NAME,
    title: MODULE_TITLE,
    icon: "fas fa-skull",
    button: true,
    visible: true,
    onClick: () => FoundryDoomV2App.open(),
    onChange: () => FoundryDoomV2App.open(),
  });
}

function handleSocketMessage(payload) {
  if (payload?.action !== "open") return;
  if (payload.sender === game.user?.id) return;
  FoundryDoomV2App.open();
}

function registerApi() {
  const api = {
    open: () => FoundryDoomV2App.open(),
    focus: () => FoundryDoomV2App.instance?.focusGame(),
    reload: () => FoundryDoomV2App.instance?.reloadGame(),
    close: () => FoundryDoomV2App.instance?.close(),
    showToPlayers: () => FoundryDoomV2App.broadcastOpen(),
    get app() {
      return FoundryDoomV2App.instance;
    },
  };

  game.modules.get(MODULE_ID).api = api;
  game.foundryDoomV2 = api;
  globalThis.launchFoundryDoomV2 = api.open;
  globalThis.openFoundryDoomV2 = api.open;
}

function normalizeBundlePath(value) {
  const path = typeof value === "string" ? value.trim() : "";
  return path || DEFAULT_BUNDLE_PATH;
}

function getSetting(key, fallback) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

Hooks.once("init", registerSettings);
Hooks.on("getSceneControlButtons", addSceneControl);
Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, handleSocketMessage);
  registerApi();
});
