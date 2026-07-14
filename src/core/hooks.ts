import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { customApiRoutes, registerAdminLink, registerApiRoute } from "./extensions";
import { config } from "./config";

export type HookName = "beforeRender" | "afterRender" | "audit";
export type HookHandler = (payload: Record<string, unknown>) => void | Promise<void>;

const handlers = new Map<HookName, Set<HookHandler>>();

export function registerHook(name: HookName, handler: HookHandler) {
  const registered = handlers.get(name) ?? new Set<HookHandler>();
  registered.add(handler);
  handlers.set(name, registered);
  return () => registered.delete(handler);
}

export async function emitHook(name: HookName, payload: Record<string, unknown>) {
  for (const handler of handlers.get(name) ?? []) {
    try {
      await handler(payload);
    } catch (error) {
      console.warn(`Plugin hook ${name} failed:`, error);
    }
  }
}

export async function loadPlugins() {
  let files: string[];
  try {
    files = await readdir(config.pluginDir);
  } catch {
    return;
  }

  for (const file of files.filter((entry) => /\.(ts|js|mjs)$/.test(entry))) {
    try {
      const module = await import(pathToFileURL(path.join(config.pluginDir, file)).href);
      if (typeof module.default === "function") {
        await module.default({ registerHook, emitHook, registerApiRoute, registerAdminLink });
      }
    } catch (error) {
      console.warn(`Plugin ${file} could not be loaded:`, error);
    }
  }
}
