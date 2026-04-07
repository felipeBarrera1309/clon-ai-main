import { createAuth } from "../auth"

// Export a static instance for Better Auth schema generation
// This file should ONLY have the auth export for schema generation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth: ReturnType<typeof createAuth> = createAuth({} as any)
