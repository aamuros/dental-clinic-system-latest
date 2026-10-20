import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Enter a valid work email address.').trim().max(254),
  password: z.string().min(1, 'Enter your password.').max(256),
})
export type LoginInput = z.infer<typeof loginSchema>
