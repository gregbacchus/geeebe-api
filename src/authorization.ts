import { logger } from '@geeebe/logging';
import jwt = require('jsonwebtoken');
import { Context, Middleware } from 'koa';

const debug = logger.child({ module: 'api:authorization' });

export interface IAuthorizationContext extends Context {
  authorization?: any;
}

export class AuthorizationDecoder {
  private readonly tokenExtracter = /^Bearer (.*)$/;

  constructor() { }

  public getToken(headers: any): string | undefined {
    const authorization = headers.authorization;
    const matches = this.tokenExtracter.exec(authorization);
    return matches && matches[1] || undefined;
  }

  public middleware(): Middleware {
    return async (ctx: IAuthorizationContext, next): Promise<void> => {
      try {
        // decode token
        const token = this.getToken(ctx.request.headers);
        if (token) {
          ctx.authorization = jwt.decode(token) || undefined;
        }
      } catch (err) {
        debug.error(err);
      }
      await next();
    };
  }
}
