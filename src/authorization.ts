import { logger } from '@geeebe/logging';
import jwt = require('jsonwebtoken');
import { Context, Middleware } from 'koa';

const TOKEN_EXTRACTOR = /^Bearer (.*)$/;
const debug = logger.child({ module: 'api:authorization' });

export interface AuthorizationContext extends Context {
  authorization?: any;
}

export class JwtDecoder {
  public static getAuthorization(headers: any): any {
    try {
      // decode token
      const token = JwtDecoder.getToken(headers);
      if (token) {
        return jwt.decode(token) || undefined;
      }
    } catch (err) {
      debug.error(err);
    }
    return undefined;
  }

  public static getToken(headers: any): string | undefined {
    const authorization = headers.authorization;
    const matches = TOKEN_EXTRACTOR.exec(authorization);
    return matches && matches[1] || undefined;
  }

  constructor() { }

  public middleware(): Middleware {
    return async (ctx: AuthorizationContext, next): Promise<void> => {
      ctx.authorization = JwtDecoder.getAuthorization(ctx.request.headers);
      await next();
    };
  }
}
