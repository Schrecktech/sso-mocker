import Router from '@koa/router';
import { createProvider } from './oidc/provider.js';
import { mountInteractions } from './oidc/interactions.js';
import { healthHandler } from './health.js';
import { loadConfig } from './config/loader.js';
import { createAdminRouter } from './admin/router.js';
import type { AppConfig, User } from './config/schema.js';
import path from 'node:path';
import type Provider from 'oidc-provider';

export interface MockerInstance {
  provider: Provider;
  issuer: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  config: AppConfig;
  users: User[];
}

export interface CreateMockerOptions {
  env?: string;
  port?: number;
  loginMode?: 'auto' | 'form';
  autoLoginUser?: string;
  configDir?: string;
  fixturesDir?: string;
}

export async function createMocker(options: CreateMockerOptions = {}): Promise<MockerInstance> {
  const env = options.env ?? process.env.SSO_MOCKER_ENV ?? 'development';
  const configDir = options.configDir ?? path.resolve('config');

  const loaded = await loadConfig({
    env,
    configDir,
    fixturesDir: options.fixturesDir,
    overrides: {
      port: options.port,
      loginMode: options.loginMode,
    },
  });

  const { config } = loaded;
  const { users } = loaded;

  if (options.autoLoginUser) {
    config.login.autoLoginUser = options.autoLoginUser;
  }

  const port = options.port ?? config.server.port;

  const provider = await createProvider({
    config,
    users,
    roles: config.roles,
    teams: config.teams,
  });

  const router = new Router();

  // Body parser for interaction POST — mounted via provider.use() so it runs
  // before the oidc-provider exec middleware
  provider.use(async (ctx, next) => {
    if (ctx.method === 'POST' && ctx.path.startsWith('/interaction/')) {
      const maxBodySize = 1_048_576; // 1MB
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of ctx.req) {
        size += (chunk as Buffer).length;
        if (size > maxBodySize) {
          ctx.status = 413;
          ctx.body = 'Request body too large';
          return;
        }
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks).toString();
      const params = new URLSearchParams(body);
      (ctx.request as any).body = Object.fromEntries(params);
    }
    await next();
  });

  // Health
  router.get('/health', healthHandler);

  // Interactions
  mountInteractions({
    provider,
    router,
    getUsers: () => users,
    getLoginMode: () => ({ mode: config.login.mode, autoLoginUser: config.login.autoLoginUser }),
  });

  // Admin API
  if (config.admin.enabled) {
    const adminRouter = createAdminRouter({ config, users });
    provider.use(adminRouter.routes() as any);
    provider.use(adminRouter.allowedMethods() as any);
  }

  provider.use(router.routes() as any);
  provider.use(router.allowedMethods() as any);

  let server: ReturnType<typeof provider.listen> | null = null;
  let resolvedIssuer = config.server.issuer;

  return {
    provider,
    get issuer() { return resolvedIssuer; },
    config,
    users,
    start: () => new Promise((resolve) => {
      server = provider.listen(port, () => {
        const addr = server!.address();
        if (typeof addr === 'object' && addr) {
          const actualPort = addr.port;
          resolvedIssuer = `http://localhost:${actualPort}`;
          if (options.port === 0) {
            (provider as any).issuer = resolvedIssuer;
          }
        }
        resolve();
      });
    }),
    stop: () => new Promise<void>((resolve, reject) => {
      if (server) {
        server.close((err) => err ? reject(err) : resolve());
      } else {
        resolve();
      }
    }),
  };
}
