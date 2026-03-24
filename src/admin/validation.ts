import { z } from 'zod';

export const CreateUserBody = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.string().min(1),
  teams: z.array(z.string()).default([]),
});

export const PatchUserBody = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  teams: z.array(z.string()).optional(),
});

export const PatchLoginConfigBody = z.object({
  mode: z.enum(['auto', 'form']).optional(),
  autoLoginUser: z.string().min(1).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserBody>;
export type PatchUserInput = z.infer<typeof PatchUserBody>;
export type PatchLoginConfigInput = z.infer<typeof PatchLoginConfigBody>;
