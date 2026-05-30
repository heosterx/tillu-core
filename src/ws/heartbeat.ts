/**
 * heartbeat.ts — WebSocket ping/pong keepalive with latency tracking.
 *
 * - Pings every 20s
 * - Terminates after 3 consecutive missed pongs (60s dead window)
 * - Tracks per-connection latency and stats
 * - Exports getHeartbeatStats() for health endpoint
 */

import type WebSocket from "ws";

export interface HeartbeatStat {
  connected: boolean;
  latency_ms: number;
  missed: number;
  last_pong: string | null;
}

const stats: Record<string, HeartbeatStat> = {};

export function getHeartbeatStats(): Record<string, HeartbeatStat> {
  return { ...stats };
}

export function setupHeartbeat(ws: WebSocket, name: string): void {
  stats[name] = { connected: true, latency_ms: 0, missed: 0, last_pong: null };

  let pingTime = 0;
  let missed = 0;

  ws.on("pong", () => {
    missed = 0;
    const latency = Date.now() - pingTime;
    stats[name] = {
      connected: true,
      latency_ms: latency,
      missed: 0,
      last_pong: new Date().toISOString(),
    };
  });

  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) {
      clearInterval(interval);
      if (stats[name]) stats[name]!.connected = false;
      return;
    }

    missed++;

    if (missed >= 3) {
      console.warn(`[${name}] Heartbeat: 3 missed pongs — terminating dead connection`);
      clearInterval(interval);
      if (stats[name]) {
        stats[name]!.connected = false;
        stats[name]!.missed = missed;
      }
      ws.terminate();
      return;
    }

    if (stats[name]) stats[name]!.missed = missed;
    pingTime = Date.now();
    ws.ping();
  }, 20_000);

  ws.on("close", () => {
    clearInterval(interval);
    if (stats[name]) stats[name]!.connected = false;
  });
}
