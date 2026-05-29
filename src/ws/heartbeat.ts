import type WebSocket from "ws";

export function setupHeartbeat(ws: WebSocket, name: string): void {
  let isAlive = true;
  
  ws.on("pong", () => {
    isAlive = true;
  });

  const interval = setInterval(() => {
    if (isAlive === false) {
      console.warn(`[${name}] Heartbeat timeout. Terminating dead connection.`);
      return ws.terminate();
    }
    isAlive = false;
    ws.ping();
  }, 30000);

  ws.on("close", () => {
    clearInterval(interval);
  });
}
