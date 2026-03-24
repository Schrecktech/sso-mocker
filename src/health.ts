import type { Context } from 'koa';

export function healthHandler(ctx: Context): void {
  ctx.status = 200;
  ctx.body = { status: 'ok' };
}
