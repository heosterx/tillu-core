import type { Request, Response } from "express";
import { config } from "../config";

interface MetricsData {
  system: {
    uptime_seconds: number;
    memory_usage: {
      rss_bytes: number;
      heap_total_bytes: number;
      heap_used_bytes: number;
      external_bytes: number;
    };
    cpu_usage: {
      user: number;
      system: number;
    };
  };
  http: {
    requests_total: number;
    requests_by_method: Record<string, number>;
    requests_by_status: Record<string, number>;
    average_response_time_ms: number;
  };
  websocket: {
    active_connections: number;
    total_connections: number;
    messages_sent: number;
    messages_received: number;
  };
  llm: {
    requests_total: number;
    requests_by_provider: Record<string, number>;
    failures_total: number;
    average_latency_ms: number;
  };
  services: {
    memory_calls: number;
    search_calls: number;
    voice_calls: number;
    see_calls: number;
  };
}

// Simple in-memory metrics store
const metrics = {
  http: {
    requestsTotal: 0,
    requestsByMethod: {} as Record<string, number>,
    requestsByStatus: {} as Record<string, number>,
    responseTimes: [] as number[],
  },
  websocket: {
    activeConnections: 0,
    totalConnections: 0,
    messagesSent: 0,
    messagesReceived: 0,
  },
  llm: {
    requestsTotal: 0,
    requestsByProvider: {} as Record<string, number>,
    failuresTotal: 0,
    latencies: [] as number[],
  },
  services: {
    memoryCalls: 0,
    searchCalls: 0,
    voiceCalls: 0,
    seeCalls: 0,
  },
};

export function incrementHttpRequest(method: string, statusCode: number, responseTime: number): void {
  metrics.http.requestsTotal++;
  metrics.http.requestsByMethod[method] = (metrics.http.requestsByMethod[method] || 0) + 1;
  metrics.http.requestsByStatus[statusCode] = (metrics.http.requestsByStatus[statusCode] || 0) + 1;
  metrics.http.responseTimes.push(responseTime);
  
  // Keep only last 1000 response times for memory efficiency
  if (metrics.http.responseTimes.length > 1000) {
    metrics.http.responseTimes.shift();
  }
}

export function incrementWebSocketConnection(active: boolean): void {
  if (active) {
    metrics.websocket.activeConnections++;
    metrics.websocket.totalConnections++;
  } else {
    metrics.websocket.activeConnections--;
  }
}

export function incrementWebSocketMessage(direction: "sent" | "received"): void {
  if (direction === "sent") {
    metrics.websocket.messagesSent++;
  } else {
    metrics.websocket.messagesReceived++;
  }
}

export function incrementLLMRequest(provider: string, latency: number, success: boolean): void {
  metrics.llm.requestsTotal++;
  metrics.llm.requestsByProvider[provider] = (metrics.llm.requestsByProvider[provider] || 0) + 1;
  
  if (!success) {
    metrics.llm.failuresTotal++;
  }
  
  metrics.llm.latencies.push(latency);
  
  // Keep only last 1000 latencies for memory efficiency
  if (metrics.llm.latencies.length > 1000) {
    metrics.llm.latencies.shift();
  }
}

export function incrementServiceCall(service: "memory" | "search" | "voice" | "see"): void {
  metrics.services[`${service}Calls`]++;
}

/**
 * GET /metrics
 * Prometheus-style metrics endpoint for monitoring
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  if (!config.monitoring.enableMetrics) {
    res.status(404).json({ error: "Metrics not enabled" });
    return;
  }

  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const metricsData: MetricsData = {
    system: {
      uptime_seconds: process.uptime(),
      memory_usage: {
        rss_bytes: memoryUsage.rss,
        heap_total_bytes: memoryUsage.heapTotal,
        heap_used_bytes: memoryUsage.heapUsed,
        external_bytes: memoryUsage.external,
      },
      cpu_usage: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
    },
    http: {
      requests_total: metrics.http.requestsTotal,
      requests_by_method: metrics.http.requestsByMethod,
      requests_by_status: metrics.http.requestsByStatus,
      average_response_time_ms: calculateAverage(metrics.http.responseTimes),
    },
    websocket: {
      active_connections: metrics.websocket.activeConnections,
      total_connections: metrics.websocket.totalConnections,
      messages_sent: metrics.websocket.messagesSent,
      messages_received: metrics.websocket.messagesReceived,
    },
    llm: {
      requests_total: metrics.llm.requestsTotal,
      requests_by_provider: metrics.llm.requestsByProvider,
      failures_total: metrics.llm.failuresTotal,
      average_latency_ms: calculateAverage(metrics.llm.latencies),
    },
    services: {
      memory_calls: metrics.services.memoryCalls,
      search_calls: metrics.services.searchCalls,
      voice_calls: metrics.services.voiceCalls,
      see_calls: metrics.services.seeCalls,
    },
  };

  res.json(metricsData);
}

/**
 * GET /metrics/prometheus
 * Prometheus-compatible metrics format
 */
export async function prometheusMetricsHandler(_req: Request, res: Response): Promise<void> {
  if (!config.monitoring.enableMetrics) {
    res.status(404).send("Metrics not enabled");
    return;
  }

  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  const prometheusFormat = [
    // System metrics
    `# HELP tillu_system_uptime_seconds Uptime of the Tillu-Core process in seconds`,
    `# TYPE tillu_system_uptime_seconds gauge`,
    `tillu_system_uptime_seconds ${process.uptime()}`,
    ``,
    `# HELP tillu_memory_usage_bytes Memory usage in bytes`,
    `# TYPE tillu_memory_usage_bytes gauge`,
    `tillu_memory_usage_bytes{type="rss"} ${memoryUsage.rss}`,
    `tillu_memory_usage_bytes{type="heap_total"} ${memoryUsage.heapTotal}`,
    `tillu_memory_usage_bytes{type="heap_used"} ${memoryUsage.heapUsed}`,
    `tillu_memory_usage_bytes{type="external"} ${memoryUsage.external}`,
    ``,
    `# HELP tillu_cpu_usage_seconds CPU usage in seconds`,
    `# TYPE tillu_cpu_usage_seconds gauge`,
    `tillu_cpu_usage_seconds{mode="user"} ${cpuUsage.user / 1000000}`,
    `tillu_cpu_usage_seconds{mode="system"} ${cpuUsage.system / 1000000}`,
    ``,
    // HTTP metrics
    `# HELP tillu_http_requests_total Total number of HTTP requests`,
    `# TYPE tillu_http_requests_total counter`,
    `tillu_http_requests_total ${metrics.http.requestsTotal}`,
    ``,
    `# HELP tillu_http_requests_by_method_total HTTP requests by method`,
    `# TYPE tillu_http_requests_by_method_total counter`,
    ...Object.entries(metrics.http.requestsByMethod).map(
      ([method, count]) => `tillu_http_requests_by_method_total{method="${method}"} ${count}`
    ),
    ``,
    `# HELP tillu_http_requests_by_status_total HTTP requests by status code`,
    `# TYPE tillu_http_requests_by_status_total counter`,
    ...Object.entries(metrics.http.requestsByStatus).map(
      ([status, count]) => `tillu_http_requests_by_status_total{status="${status}"} ${count}`
    ),
    ``,
    `# HELP tillu_http_average_response_time_ms Average HTTP response time in milliseconds`,
    `# TYPE tillu_http_average_response_time_ms gauge`,
    `tillu_http_average_response_time_ms ${calculateAverage(metrics.http.responseTimes)}`,
    ``,
    // WebSocket metrics
    `# HELP tillu_websocket_active_connections Number of active WebSocket connections`,
    `# TYPE tillu_websocket_active_connections gauge`,
    `tillu_websocket_active_connections ${metrics.websocket.activeConnections}`,
    ``,
    `# HELP tillu_websocket_total_connections_total Total WebSocket connections`,
    `# TYPE tillu_websocket_total_connections_total counter`,
    `tillu_websocket_total_connections_total ${metrics.websocket.totalConnections}`,
    ``,
    `# HELP tillu_websocket_messages_total Total WebSocket messages`,
    `# TYPE tillu_websocket_messages_total counter`,
    `tillu_websocket_messages_total{direction="sent"} ${metrics.websocket.messagesSent}`,
    `tillu_websocket_messages_total{direction="received"} ${metrics.websocket.messagesReceived}`,
    ``,
    // LLM metrics
    `# HELP tillu_llm_requests_total Total LLM API requests`,
    `# TYPE tillu_llm_requests_total counter`,
    `tillu_llm_requests_total ${metrics.llm.requestsTotal}`,
    ``,
    `# HELP tillu_llm_requests_by_provider_total LLM requests by provider`,
    `# TYPE tillu_llm_requests_by_provider_total counter`,
    ...Object.entries(metrics.llm.requestsByProvider).map(
      ([provider, count]) => `tillu_llm_requests_by_provider_total{provider="${provider}"} ${count}`
    ),
    ``,
    `# HELP tillu_llm_failures_total Total LLM API failures`,
    `# TYPE tillu_llm_failures_total counter`,
    `tillu_llm_failures_total ${metrics.llm.failuresTotal}`,
    ``,
    `# HELP tillu_llm_average_latency_ms Average LLM API latency in milliseconds`,
    `# TYPE tillu_llm_average_latency_ms gauge`,
    `tillu_llm_average_latency_ms ${calculateAverage(metrics.llm.latencies)}`,
    ``,
    // Service metrics
    `# HELP tillu_service_calls_total Total service calls`,
    `# TYPE tillu_service_calls_total counter`,
    `tillu_service_calls_total{service="memory"} ${metrics.services.memoryCalls}`,
    `tillu_service_calls_total{service="search"} ${metrics.services.searchCalls}`,
    `tillu_service_calls_total{service="voice"} ${metrics.services.voiceCalls}`,
    `tillu_service_calls_total{service="see"} ${metrics.services.seeCalls}`,
  ].join("\n");

  res.set("Content-Type", "text/plain");
  res.send(prometheusFormat);
}

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, val) => acc + val, 0);
  return sum / numbers.length;
}