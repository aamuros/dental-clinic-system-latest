import { z } from 'zod'

export const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: z
    .url()
    .refine((url) => /^https?:\/\//.test(url), 'Use an HTTP or HTTPS URL.'),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .trim()
    .min(1)
    .refine(
      (key) => key.startsWith('sb_publishable_'),
      'Use a Supabase publishable key, never a secret or service-role key.',
    ),
})

export function readPublicEnv() {
  return publicEnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env
      .VITE_SUPABASE_PUBLISHABLE_KEY,
  })
}

export function requirePublicEnv() {
  const result = readPublicEnv()
  if (!result.success)
    throw new Error(
      'Supabase configuration is missing or invalid. Check .env.local against .env.example.',
    )
  return result.data
}
