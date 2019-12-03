import { Statuses } from '@geeebe/common';
import { logger } from '@geeebe/logging';
import { Context, Middleware } from 'koa';

import jwt = require('jsonwebtoken');

const TOKEN_EXTRACTOR = /^Bearer (.*)$/;
const debug = logger.child({ module: 'api:authorization' });

export interface AuthorizationContext extends Context {
  authorization?: any;
}

export type CheckToken = (authorization: any, ctx: Context) => Promise<boolean>;

export interface VerifyOptions extends jwt.VerifyOptions {
  check?: CheckToken;
}

export interface AuthorizationSuccess {
  authorization: string | object;
  status: undefined;
}

export interface AuthorizationFailure {
  authorization: undefined;
  status: Statuses;
}

export namespace Jwt {
  export function getBearerToken(headers: any): string | undefined {
    const authorization = headers.authorization;
    const matches = TOKEN_EXTRACTOR.exec(authorization);
    return matches && matches[1] || undefined;
  }
}

export class JwtDecoder {
  public static getAuthorization(headers: any): any {
    try {
      // decode token
      const token = Jwt.getBearerToken(headers);
      if (token) {
        return jwt.decode(token) || undefined;
      }
    } catch (err) {
      debug.error(err);
    }
    return undefined;
  }

  constructor() { }

  public middleware(): Middleware {
    return async (ctx: AuthorizationContext, next): Promise<void> => {
      ctx.authorization = JwtDecoder.getAuthorization(ctx.request.headers);
      await next();
    };
  }
}

export class JwtAuthentication {
  constructor(
    private readonly secretOrPublicKey: string | Buffer,
    private readonly verifyOptions?: VerifyOptions,
  ) { }

  public getAuthorization(headers: any): AuthorizationSuccess | AuthorizationFailure {
    try {
      // decode token
      const token = Jwt.getBearerToken(headers);
      if (token) {
        return {
          authorization: jwt.verify(token, this.secretOrPublicKey, this.verifyOptions),
          status: undefined,
        };
      }
      return {
        authorization: undefined,
        status: Statuses.UNAUTHORIZED,
      };
    } catch (err) {
      debug.error(err);
      switch (err.name) {
        case 'JsonWebTokenError':
          return {
            authorization: undefined,
            status: Statuses.FORBIDDEN,
          };
        default:
          return {
            authorization: undefined,
            status: Statuses.UNAUTHORIZED,
          };
      }
    }
  }

  public middleware(): Middleware {
    return async (ctx: AuthorizationContext, next): Promise<void> => {
      const { status, authorization } = this.getAuthorization(ctx.request.headers);
      if (status) {
        ctx.status = status;
        return;
      }
      if (this.verifyOptions && this.verifyOptions.check && !(await this.verifyOptions.check(authorization, ctx))) {
        ctx.status = Statuses.FORBIDDEN;
        return;
      }
      ctx.authorization = authorization;
      await next();
    };
  }
}
