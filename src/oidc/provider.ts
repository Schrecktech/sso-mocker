import Provider from 'oidc-provider';
import { generateKeyPair, exportJWK } from 'jose';
import type { AppConfig, User } from '../config/schema.js';
import { MemoryAdapter } from '../store/memory.js';
import { buildUserClaims } from './claims.js';
import { buildScopeRegistry } from './scopes.js';

interface ProviderOptions {
  config: AppConfig;
  users: User[];
  roles: AppConfig['roles'];
  teams: AppConfig['teams'];
}

export async function createProvider({ config, users, roles, teams }: ProviderOptions): Promise<Provider> {
  const initialRegistry = buildScopeRegistry(teams, config.clients);

  const clients = config.clients.map((c) => ({
    client_id: c.clientId,
    client_secret: c.clientSecret ?? undefined,
    redirect_uris: c.redirectUris,
    grant_types: c.grantTypes,
    response_types: c.grantTypes.includes('authorization_code') ? ['code'] : [],
    token_endpoint_auth_method: c.tokenEndpointAuthMethod,
    scope: c.scopes.length > 0 ? c.scopes.join(' ') : undefined,
  }));

  const providerConfig: Record<string, unknown> = {
    adapter: MemoryAdapter,
    clients,
    claims: {
      openid: ['sub'],
      profile: ['name', 'role', 'teams', 'scopes', 'team_scopes'],
      email: ['email'],
    },
    scopes: ['openid', 'profile', 'email', 'offline_access', ...initialRegistry],
    conformIdTokenClaims: false,
    features: {
      devInteractions: { enabled: false },
      clientCredentials: { enabled: true },
    },
    ttl: {
      AccessToken: config.tokens.accessToken.ttl,
      IdToken: config.tokens.idToken.ttl,
      RefreshToken: config.tokens.refreshToken.ttl,
    },
    findAccount: async (_ctx: unknown, id: string) => {
      const user = users.find((u) => u.id === id);
      if (!user) return undefined;
      const currentRegistry = buildScopeRegistry(teams, config.clients);
      const userClaims = buildUserClaims(user, roles, teams, currentRegistry);
      return {
        accountId: id,
        async claims(_use: string, _scope: string) {
          return userClaims;
        },
      };
    },
    interactions: {
      url: (_ctx: unknown, interaction: { uid: string }) => `/interaction/${interaction.uid}`,
    },
    cookies: {
      keys: config.cookies.keys,
    },
  };

  if (config.signing.keys && config.signing.keys.length > 0) {
    providerConfig.jwks = { keys: config.signing.keys };
  } else {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const jwk = await exportJWK(privateKey);
    jwk.use = 'sig';
    jwk.alg = 'RS256';
    providerConfig.jwks = { keys: [jwk] };
  }

  const provider = new Provider(config.server.issuer, providerConfig as any);

  return provider;
}
