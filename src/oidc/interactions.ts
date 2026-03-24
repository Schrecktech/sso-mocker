import type Provider from 'oidc-provider';
import type Router from '@koa/router';
import type { User } from '../config/schema.js';
import { renderLoginPage } from '../ui/login.js';

interface InteractionOptions {
  provider: Provider;
  router: Router;
  getUsers: () => User[];
  getLoginMode: () => { mode: string; autoLoginUser: string };
}

async function handleLogin(
  provider: Provider,
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
  accountId: string,
  details: Awaited<ReturnType<Provider['interactionDetails']>>,
): Promise<void> {
  const result: Record<string, unknown> = {
    login: { accountId },
  };
  await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: true });
}

async function handleConsent(
  provider: Provider,
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
  details: Awaited<ReturnType<Provider['interactionDetails']>>,
): Promise<void> {
  const grant = details.grantId
    ? await (provider as any).Grant.find(details.grantId)
    : new (provider as any).Grant({ accountId: details.session?.accountId, clientId: (details.params as any).client_id });

  const missingOIDCScope = (details as any).prompt?.details?.missingOIDCScope;
  if (missingOIDCScope) {
    grant.addOIDCScope(Array.isArray(missingOIDCScope) ? missingOIDCScope.join(' ') : String(missingOIDCScope));
  }

  const missingOIDCClaims = (details as any).prompt?.details?.missingOIDCClaims;
  if (missingOIDCClaims) {
    grant.addOIDCClaims(missingOIDCClaims);
  }

  const missingResourceScopes = (details as any).prompt?.details?.missingResourceScopes;
  if (missingResourceScopes) {
    for (const [indicator, scopes] of Object.entries(missingResourceScopes as Record<string, string[]>)) {
      grant.addResourceScope(indicator, scopes.join(' '));
    }
  }

  const grantId = await grant.save();

  const result: Record<string, unknown> = {};
  if (!details.grantId) {
    result.consent = { grantId };
  } else {
    result.consent = { grantId };
  }

  await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: true });
}

export function mountInteractions({ provider, router, getUsers, getLoginMode }: InteractionOptions): void {
  router.get('/interaction/:uid', async (ctx) => {
    const details = await provider.interactionDetails(ctx.req, ctx.res);
    const promptName = (details as any).prompt?.name;
    const loginConfig = getLoginMode();

    // Handle consent prompt - always auto-approve
    if (promptName === 'consent') {
      await handleConsent(provider, ctx.req, ctx.res, details);
      return;
    }

    // Handle login prompt
    if (loginConfig.mode === 'auto') {
      const user = getUsers().find((u) => u.id === loginConfig.autoLoginUser);
      if (!user) {
        ctx.status = 500;
        ctx.body = `autoLoginUser '${loginConfig.autoLoginUser}' not found`;
        return;
      }
      await handleLogin(provider, ctx.req, ctx.res, user.id, details);
      return;
    }

    // Form mode - render login page
    const clientId = (details.params as any).client_id ?? 'unknown';
    const scopes = (details.params as any).scope ?? 'openid';
    const html = renderLoginPage(getUsers(), `/interaction/${details.uid}`, clientId, scopes);
    ctx.type = 'text/html';
    ctx.body = html;
  });

  router.post('/interaction/:uid', async (ctx) => {
    const body = ctx.request.body as Record<string, string>;
    const userId = body.user;
    const details = await provider.interactionDetails(ctx.req, ctx.res);
    await handleLogin(provider, ctx.req, ctx.res, userId, details);
  });
}
