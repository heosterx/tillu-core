import { writeMemory, searchMemory } from "../tools/memory.tool";

export interface CalendarEvent {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  category: "school" | "exam" | "birthday" | "holiday" | "personal";
  notes?: string;
}

// Built-in defaults for Class 12 Maples Academy, Khatauli
const STATIC_SCHEDULE = [
  { day: "Monday", events: "Physics Class at 09:00 AM, Chemistry Class at 11:00 AM" },
  { day: "Tuesday", events: "Maths Class at 09:00 AM, English Class at 11:00 AM" },
  { day: "Wednesday", events: "Physics Class at 09:00 AM, Chemistry Lab at 11:00 AM" },
  { day: "Thursday", events: "Maths Class at 09:00 AM, Physical Education at 11:00 AM" },
  { day: "Friday", events: "Physics Class at 09:00 AM, English Class at 11:00 AM" },
  { day: "Saturday", events: "Weekly Mock Tests at 09:00 AM" }
];

const STATIC_EXAMS = [
  { title: "CBSE Physics Board Exam", date: "2027-03-01", notes: "Board Exam (Theory)" },
  { title: "CBSE Chemistry Board Exam", date: "2027-03-05", notes: "Board Exam (Theory)" },
  { title: "CBSE Mathematics Board Exam", date: "2027-03-12", notes: "Board Exam (Theory)" },
  { title: "CBSE English Core Board Exam", date: "2027-03-18", notes: "Board Exam (Theory)" }
];

/**
 * Get school schedule for a specific day.
 */
export function getSchoolSchedule(dayName: string): string {
  const matched = STATIC_SCHEDULE.find((s) => s.day.toLowerCase() === dayName.toLowerCase());
  return matched ? matched.events : "No school classes scheduled.";
}

/**
 * Add a custom event to memory.
 */
export async function addEvent(event: CalendarEvent): Promise<void> {
  const content = `Calendar event: ${event.title} on ${event.date}${event.time ? ` at ${event.time}` : ""} [Category: ${event.category}]${event.notes ? ` — ${event.notes}` : ""}`;
  await writeMemory(content, "event", "high");
  console.log(`[Calendar] Saved event: "${event.title}"`);
}

/**
 * Read upcoming events/exams and calculate countdowns.
 */
export async function getUpcomingEvents(daysAhead = 30): Promise<Array<{ title: string; days_remaining: number; notes?: string }>> {
  const results: Array<{ title: string; days_remaining: number; notes?: string }> = [];
  const now = new Date();
  
  // 1. Process static exams
  for (const exam of STATIC_EXAMS) {
    const examDate = new Date(exam.date);
    const diffTime = examDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays >= 0 && diffDays <= daysAhead) {
      results.push({
        title: exam.title,
        days_remaining: diffDays,
        notes: exam.notes
      });
    }
  }

  // 2. Fetch custom events from memory
  try {
    const memories = await searchMemory("Calendar event", 10) as Array<{ content: string }>;
    for (const mem of memories) {
      // Parse dates from string e.g., "Calendar event: Physics Lab on 2026-06-15"
      const dateMatch = mem.content.match(/on\s+(\d{4}-\d{2}-\d{2})/);
      const titleMatch = mem.content.match(/event:\s+([\s\S]+?)\s+on/);
      
      if (dateMatch?.[1]) {
        const eventDate = new Date(dateMatch[1]);
        const diffTime = eventDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0 && diffDays <= daysAhead) {
          results.push({
            title: titleMatch?.[1] ? titleMatch[1].trim() : "Custom Event",
            days_remaining: diffDays,
            notes: mem.content
          });
        }
      }
    }
  } catch (e) {
    console.warn("[Calendar] Failed to fetch custom events from memory:", (e as Error).message);
  }

  return results.sort((a, b) => a.days_remaining - b.days_remaining);
}
