import { z } from 'zod';

export const ServerSchema = z.object({
  port: z.number().int().min(0).max(65535).default(9090),
  issuer: z.string().url().default('http://localhost:9090'),
});

export const RedisSchema = z.object({
  url: z.string(),
}).optional();

export const StorageSchema = z.object({
  adapter: z.enum(['memory', 'redis']).default('memory'),
  redis: RedisSchema,
});

export const LoginSchema = z.object({
  mode: z.enum(['auto', 'form']).default('form'),
  autoLoginUser: z.string().default('alice'),
});

export const SigningSchema = z.object({
  keys: z.any().default([]),
});

export const CookiesSchema = z.object({
  keys: z.array(z.string()).default(['sso-mocker-cookie-key']),
});

export const TokensSchema = z.object({
  idToken: z.object({ ttl: z.number().int().positive().default(3600) }).default({ ttl: 3600 }),
  accessToken: z.object({
    ttl: z.number().int().positive().default(3600),
    format: z.enum(['jwt', 'opaque']).default('jwt'),
  }).default({ ttl: 3600, format: 'jwt' }),
  refreshToken: z.object({
    ttl: z.number().int().positive().default(86400),
    enabled: z.boolean().default(true),
  }).default({ ttl: 86400, enabled: true }),
});

export const ClientSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().nullable().default(null),
  redirectUris: z.array(z.string()).default([]),
  grantTypes: z.array(z.string()),
  scopes: z.array(z.string()).default([]),
  tokenEndpointAuthMethod: z.enum(['none', 'client_secret_basic', 'client_secret_post']).default('client_secret_basic'),
});

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
});

export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
});

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  teams: z.array(z.string()).default([]),
});

export const CorsSchema = z.object({
  allowedOrigins: z.array(z.string()).default([]),
});

export const LoggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const AdminSchema = z.object({
  enabled: z.boolean().default(true),
  apiKey: z.string().nullable().default(null),
});

export const AppConfigSchema = z.object({
  server: ServerSchema.default({ port: 9090, issuer: 'http://localhost:9090' }),
  storage: StorageSchema.default({ adapter: 'memory' }),
  login: LoginSchema.default({ mode: 'form', autoLoginUser: 'alice' }),
  signing: SigningSchema.default({ keys: [] }),
  cookies: CookiesSchema.default({ keys: ['sso-mocker-cookie-key'] }),
  tokens: TokensSchema.default({
    idToken: { ttl: 3600 },
    accessToken: { ttl: 3600, format: 'jwt' },
    refreshToken: { ttl: 86400, enabled: true },
  }),
  clients: z.array(ClientSchema).default([]),
  teams: z.array(TeamSchema).default([]),
  roles: z.array(RoleSchema).default([]),
  cors: CorsSchema.default({ allowedOrigins: [] }),
  logging: LoggingSchema.default({ level: 'info' }),
  admin: AdminSchema.default({ enabled: true, apiKey: null }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type User = z.infer<typeof UserSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Client = z.infer<typeof ClientSchema>;
