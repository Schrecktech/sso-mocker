/**
 * OIDC test helper — lightweight fetch-based client for integration tests.
 */

export async function discoverEndpoints(issuer: string) {
  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  return res.json();
}

/**
 * Perform a client_credentials grant.
 *
 * Uses HTTP Basic authentication (client_secret_basic) which is the default
 * auth method for the `my-backend` client defined in default.yaml.
 */
export async function performClientCredentials(
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
  scope?: string,
) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    ...(scope ? { scope } : {}),
  });

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
  });

  return { status: res.status, body: await res.json() };
}
