import type { GamingHudState } from "@t3tools/contracts";
import * as Electron from "electron";

const hudWindows = new WeakSet<Electron.BrowserWindow>();

export function isGamingHudWindow(window: Electron.BrowserWindow) {
  return hudWindows.has(window);
}

// This window has no preload or app credentials. Text is assigned through
// textContent so thread titles cannot become markup or executable code.
const document = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
*{box-sizing:border-box}body{margin:0;padding:8px;font:13px system-ui;color:#f4f4f5;background:transparent}
main{padding:14px 16px;border:1px solid #ffffff28;border-radius:14px;background:#14141ee8}
header{font-size:11px;font-weight:700;letter-spacing:1.5px;color:#b6b6c9;margin-bottom:10px}
.counts{display:flex;gap:20px;margin-bottom:8px}.count{font-size:22px;font-weight:700}.label{font-size:11px;color:#b6b6c9}
.running{color:#a5b4fc}.attention{color:#fbbf24}.row{border-top:1px solid #ffffff18;padding-top:7px;margin-top:7px}
.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reason{font-size:11px;color:#fbbf24;margin-top:2px}
footer{font-size:11px;color:#b6b6c9;margin-top:8px}.offline{color:#fca5a5}
</style></head><body><main><header>T3 CODE · GAMING HUD</header>
<div class="counts"><div><div id="running" class="count running">0</div><div class="label">RUNNING</div></div>
<div><div id="waiting" class="count running">0</div><div class="label">WAITING</div></div>
<div><div id="attention" class="count attention">0</div><div class="label">NEED YOU</div></div></div>
<div id="rows"></div><footer id="footer">Connecting…</footer></main>
<script>
window.updateHud = (environments) => {
 const live = environments.filter(e => e.connected);
 const offline = environments.length - live.length;
 const running = live.reduce((n,e) => n+e.running,0);
 const waiting = live.reduce((n,e) => n+e.waiting,0);
 const count = live.reduce((n,e) => n+e.attentionCount,0);
 document.getElementById('running').textContent = running;
 document.getElementById('attention').textContent = count;
 document.getElementById('waiting').textContent = waiting;
 const rows = live.flatMap(e => e.attention.map(a => ({...a, environment: e.label})));
 rows.sort((a,b) => Number(a.reason === 'Finished') - Number(b.reason === 'Finished'));
 const root = document.getElementById('rows'); root.replaceChildren();
 for (const item of rows.slice(0,3)) {
   const row = document.createElement('div'); row.className = 'row';
   const title = document.createElement('div'); title.className = 'title'; title.textContent = item.title;
   const reason = document.createElement('div'); reason.className = 'reason';
   reason.textContent = item.reason + (environments.length > 1 ? ' · ' + item.environment : '');
   row.append(title,reason); root.append(row);
 }
 const footer = document.getElementById('footer');
 footer.className = offline || !environments.length ? 'offline' : '';
 footer.textContent = !environments.length ? 'No connected environments' : offline ? offline + ' environment(s) disconnected · counts may be incomplete' : count > 3 ? '+' + (count-3) + ' more · open T3 Code to review' : count ? 'Open T3 Code to review' : running ? 'Agents are working' : waiting ? 'Agents are monitoring background work' : 'All quiet';
};
</script></body></html>`;

export function gamingHudBounds(area: Electron.Rectangle, position: GamingHudState["position"]) {
  const width = Math.min(320, area.width);
  const height = Math.min(292, area.height);
  const margin = 16;
  return {
    width,
    height,
    x: position.endsWith("right")
      ? area.x + Math.max(0, area.width - width - margin)
      : area.x + Math.min(margin, area.width - width),
    y: position.startsWith("bottom")
      ? area.y + Math.max(0, area.height - height - margin)
      : area.y + Math.min(margin, area.height - height),
  };
}

/** One HUD per renderer. Closing or reloading its owner discards its status. */
export function createGamingHud(owner: Electron.BrowserWindow) {
  let window: Electron.BrowserWindow | null = null;
  let loading: Promise<void> | null = null;
  let latest: GamingHudState | null = null;
  let lastPosition: GamingHudState["position"] | null = null;
  let disposed = false;
  const hide = () => {
    latest = null;
    window?.destroy();
    window = null;
    loading = null;
    lastPosition = null;
  };
  const positionWindow = () => {
    if (!window || window.isDestroyed() || !latest || owner.isDestroyed()) return;
    const area = Electron.screen.getDisplayMatching(owner.getBounds()).workArea;
    window.setBounds(gamingHudBounds(area, latest.position));
  };
  const reset = () => hide();
  owner.webContents.on("did-start-loading", reset);
  owner.webContents.on("render-process-gone", reset);
  owner.on("move", positionWindow);
  Electron.screen.on("display-metrics-changed", positionWindow);
  Electron.screen.on("display-removed", positionWindow);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    hide();
    owner.webContents.removeListener("did-start-loading", reset);
    owner.webContents.removeListener("render-process-gone", reset);
    owner.removeListener("move", positionWindow);
    owner.removeListener("closed", dispose);
    Electron.screen.removeListener("display-metrics-changed", positionWindow);
    Electron.screen.removeListener("display-removed", positionWindow);
  };
  owner.once("closed", dispose);
  return {
    dispose,
    async update(state: GamingHudState) {
      if (disposed || owner.isDestroyed()) return;
      if (!state.enabled) {
        hide();
        return;
      }
      latest = state;
      if (!window || window.isDestroyed()) {
        window = new Electron.BrowserWindow({
          title: "T3 Code Gaming HUD",
          width: 320,
          height: 292,
          show: false,
          frame: false,
          transparent: true,
          backgroundColor: "#00000000",
          alwaysOnTop: true,
          focusable: false,
          skipTaskbar: true,
          resizable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          hasShadow: false,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        });
        hudWindows.add(window);
        window.setIgnoreMouseEvents(true);
        window.setAlwaysOnTop(true, "screen-saver");
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.webContents.on("will-navigate", (event) => event.preventDefault());
        loading = window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
        positionWindow();
      }
      const target = window;
      if (lastPosition !== state.position) {
        positionWindow();
        lastPosition = state.position;
      }
      try {
        await loading;
      } catch (error) {
        if (target !== window || target.isDestroyed()) return;
        hide();
        throw error;
      }
      // A disable, reload, or newer update may have arrived while loading.
      if (target !== window || target.isDestroyed() || latest !== state) return;
      try {
        await target.webContents.executeJavaScript(
          `window.updateHud(${JSON.stringify(state.environments)})`,
        );
      } catch (error) {
        if (target !== window || target.isDestroyed()) return;
        hide();
        throw error;
      }
      if (target === window && !target.isDestroyed() && !target.isVisible()) target.showInactive();
    },
  };
}
