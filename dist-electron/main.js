import { BrowserWindow as e, app as t, clipboard as n, dialog as r, ipcMain as i } from "electron";
import { fileURLToPath as a } from "node:url";
import o from "node:path";
import s from "node:fs";
//#region electron/main.ts
var c = o.dirname(a(import.meta.url));
process.env.APP_ROOT = o.join(c, ".."), t.disableHardwareAcceleration();
var l = process.env.VITE_DEV_SERVER_URL, u = o.join(process.env.APP_ROOT, "dist-electron"), d = o.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = l ? o.join(process.env.APP_ROOT, "public") : d;
var f;
function p(e) {
	if (!e) return e;
	let t = e.replace(/\\/g, "/");
	return t.startsWith("/projects/") || t.startsWith("projects/") ? o.join(process.env.VITE_PUBLIC || process.env.APP_ROOT || "", t.replace(/^\//, "")) : e;
}
function m() {
	return process.env.APP_ROOT || o.dirname(t.getPath("exe"));
}
function h(e) {
	return (e.trim() || "podchat-export").replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, "-");
}
function g() {
	f = new e({
		width: 1400,
		height: 900,
		webPreferences: {
			preload: o.join(c, "preload.cjs"),
			webSecurity: !1,
			contextIsolation: !0,
			nodeIntegration: !1
		}
	}), l ? (f.loadURL(l), f.webContents.openDevTools()) : f.loadFile(o.join(d, "index.html")), f.webContents.on("console-message", (e, t, n, r, i) => {
		console.log(`[Renderer:${t}] ${n} (at ${i}:${r})`);
	}), f.webContents.on("render-process-gone", (e, t) => {
		console.error("[Renderer gone]", t.reason, t.exitCode);
	}), f.webContents.on("preload-error", (e, t, n) => {
		console.error("[Preload error]", t, n);
	});
}
t.on("window-all-closed", () => {
	process.platform !== "darwin" && (t.quit(), f = null);
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && g();
}), t.whenReady().then(g), i.handle("ping", () => "pong"), i.handle("export-video", async (e, t) => {
	console.log("Received export video request with config:", t);
	let n = Date.now(), r = Number(t?.exportRange?.start || 0), i = Number(t?.exportRange?.end || 0), a = Math.max(.5, i - r), o = Math.max(1800, Math.min(12e3, Math.round(a * 320))), c = [
		{
			until: .12,
			label: "Preparing timeline"
		},
		{
			until: .34,
			label: "Collecting assets"
		},
		{
			until: .78,
			label: "Rendering frames"
		},
		{
			until: .96,
			label: "Packaging output"
		},
		{
			until: 1,
			label: "Done"
		}
	], l = (e) => {
		let t = Date.now() - n, r = c.find((t) => e <= t.until)?.label || "Rendering", i = e > 0 ? Math.max(0, Math.round(t * ((1 - e) / e))) : null;
		f?.webContents.send("export-progress", {
			progress: e,
			elapsedMs: t,
			estimatedRemainingMs: i,
			stage: r
		});
	};
	l(0), await new Promise((e) => {
		let t = Date.now(), n = setInterval(() => {
			let r = Math.min(1, (Date.now() - t) / o);
			l(r), r >= 1 && (clearInterval(n), e());
		}, 140);
	});
	let u = typeof t?.outputPath == "string" ? t.outputPath : "", d = null;
	return u && (d = `${u}.podchat-render.json`, s.writeFileSync(d, JSON.stringify({
		note: "Video renderer is not wired yet. This file records the queued export payload for verification.",
		requestedOutputPath: u,
		createdAt: (/* @__PURE__ */ new Date()).toISOString(),
		payload: t
	}, null, 2), "utf-8")), {
		success: !0,
		placeholder: !0,
		outputPath: u,
		manifestPath: d,
		message: d ? `Export workflow finished. Placeholder render manifest saved to ${d}` : "Export workflow finished."
	};
}), i.handle("get-export-paths", async (e, t) => {
	let n = m(), r = typeof t?.projectPath == "string" && t.projectPath ? p(t.projectPath) : "", i = r ? o.dirname(r) : n, a = h(t?.projectTitle || "podchat-export");
	return {
		runtimeDir: n,
		quickSavePath: o.join(n, `${a}.mp4`),
		suggestedPath: o.join(i, `${a}.mp4`)
	};
}), i.handle("show-open-dialog", async (e, t) => f ? await r.showOpenDialog(f, t) : null), i.handle("show-save-dialog", async (e, t) => f ? await r.showSaveDialog(f, t) : null), i.handle("read-file", async (e, t) => {
	try {
		return s.readFileSync(p(t), "utf-8");
	} catch (e) {
		throw Error(`Failed to read file: ${e.message}`);
	}
}), i.handle("write-file", async (e, t, n) => {
	try {
		return s.writeFileSync(p(t), n, "utf-8"), !0;
	} catch (e) {
		throw Error(`Failed to write file: ${e.message}`);
	}
}), i.handle("capture-rect-to-clipboard", async (e, t) => {
	if (!f) return !1;
	try {
		let e = await f.webContents.capturePage(t);
		return n.writeImage(e), !0;
	} catch (e) {
		throw Error(`Failed to capture rect: ${e.message}`);
	}
});
//#endregion
export { u as MAIN_DIST, d as RENDERER_DIST, l as VITE_DEV_SERVER_URL };
