/**
 * Time utilities for IST (Asia/Kolkata, UTC+5:30)
 */

export function getISTTime(): string {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getISTTimeOfDay(): "morning" | "afternoon" | "evening" | "night" {
  const hour = parseInt(
    new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }),
    10
  );
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function getISTHour(): number {
  return parseInt(
    new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }),
    10
  );
}

export function nowISO(): string {
  return new Date().toISOString();
}
