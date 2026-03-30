import { z, ZodError } from 'zod';

export function formatZodError(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

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

export const CreateRoleBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scopes: z.array(z.string()),
});

export const PatchRoleBody = z.object({
  name: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
});

export const CreateTeamBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scopes: z.array(z.string()),
});

export const PatchTeamBody = z.object({
  name: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserBody>;
export type PatchUserInput = z.infer<typeof PatchUserBody>;
export type PatchLoginConfigInput = z.infer<typeof PatchLoginConfigBody>;
export type CreateRoleInput = z.infer<typeof CreateRoleBody>;
export type PatchRoleInput = z.infer<typeof PatchRoleBody>;
export const ImportBody = z.object({
  roles: z.array(CreateRoleBody).optional(),
  teams: z.array(CreateTeamBody).optional(),
  users: z.array(CreateUserBody).optional(),
  clients: z.array(z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().nullable().default(null),
    redirectUris: z.array(z.string()).default([]),
    grantTypes: z.array(z.string()),
    scopes: z.array(z.string()).default([]),
    tokenEndpointAuthMethod: z.enum(['none', 'client_secret_basic', 'client_secret_post']).default('client_secret_basic'),
  })).optional(),
});

export type CreateTeamInput = z.infer<typeof CreateTeamBody>;
export type PatchTeamInput = z.infer<typeof PatchTeamBody>;
export type ImportInput = z.infer<typeof ImportBody>;
