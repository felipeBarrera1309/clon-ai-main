import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Process scheduling intents every 15 seconds — fallback for when
// status webhooks don't arrive (e.g., no outbound messages sent).
// Primary processing happens via status webhooks (~1-2s latency).
crons.interval(
  "process-scheduling-intents",
  { seconds: 15 },
  internal.system.schedulingIntents.processSchedulingIntents,
  {}
)

export default crons
