import { Statuses, Time } from '@geeebe/common';
import { logger, Logger } from '@geeebe/logging';
import * as Router from '@koa/router';
import axios from 'axios';
import { createSecretKey } from 'crypto';
import { createRemoteJWKSet } from 'jose/jwks/remote';
import { JWSHeaderParameters, JWTPayload } from 'jose/jwt/unsecured';
import { GetKeyFunction, jwtVerify, JWTVerifyGetKey, JWTVerifyOptions, KeyLike } from 'jose/jwt/verify';
import { FlattenedJWSInput } from 'jose/webcrypto/types';
import { Context, Middleware } from 'koa';
import { ApiContext, RequestHeaders } from './api';

import Application = require('koa');
import LRU = require('lru-cache');

const TOKEN_EXTRACTOR = /^Bearer (.*)$/;
const debug = logger.child({ module: 'api:authorization' });

export interface MaybeWithAuthorization {
  authorization?: JWTPayload;
}

export interface AuthorizationContext extends ApiContext, MaybeWithAuthorization {
}

export type CheckToken = (authorization: JWTPayload | undefined, ctx: Context) => Promise<boolean>;

type KeySet = GetKeyFunction<JWSHeaderParameters, FlattenedJWSInput>;

export interface Options {
  verifyOptions?: JWTVerifyOptions;
  continueOnUnauthorized?: boolean;

  check?: CheckToken;
  cacheOptions?: LRU.Options<string, KeySet>;
}

interface OpenidConfiguration {
  'jwks_uri': string;
}

export interface AuthorizationSuccess {
  authorization: JWTPayload;
  status: undefined;
}

export interface AuthorizationFailure {
  authorization: undefined;
  status: Statuses;
}

export namespace Jwt {
  export const getBearerToken = (headers: RequestHeaders): string | undefined => {
    const authorization = headers.authorization;
    if (!authorization) return undefined;
    const matches = TOKEN_EXTRACTOR.exec(Array.isArray(authorization) ? authorization[0] : authorization);
    return matches && matches[1] || undefined;
  };

  export const decode = (jwt: string): {
    payload: JWTPayload;
    header: JWSHeaderParameters;
  } => {
    if (typeof jwt !== 'string') {
      throw new Error('JWT must be a string');
    }
    const { 0: encodedHeader, 1: encodedPayload, length } = jwt.split('.');
    if (length !== 3) {
      throw new Error('Invalid JWT');
    }
    try {
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64').toString('utf8')) as JWSHeaderParameters;
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8')) as JWTPayload;
      return { payload, header };
    }
    catch (err) {
      throw new Error('Invalid JWT - Error Parsing JSON');
    }
  };
}

export class JwtDecoder {
  constructor() { }

  public middleware(): Middleware<any, AuthorizationContext> & Router.Middleware<any, AuthorizationContext> {
    return async (ctx: AuthorizationContext, next: Application.Next): Promise<void> => {
      const { headers } = ctx.request;
      ctx.authorization = JwtDecoder.getAuthorization(headers);
      await next();
    };
  }
}

export namespace JwtDecoder {
  export const getAuthorization = (headers: RequestHeaders): JWTPayload | undefined => {
    try {
      // decode token
      const token = Jwt.getBearerToken(headers);
      if (token) {
        return Jwt.decode(token).payload;
      }
    } catch (err) {
      debug.error(err);
    }
    return undefined;
  };
}

abstract class BaseJwtAuthentication {
  constructor(
    protected readonly options?: Options,
  ) { }

  public async getAuthorization(headers: RequestHeaders, log: Logger): Promise<AuthorizationSuccess | AuthorizationFailure> {
    try {
      // decode token
      const token = Jwt.getBearerToken(headers);
      if (token) {
        const result = await jwtVerify(token, await this.getSecretOrPublicKey(token), this.options?.verifyOptions);
        return {
          authorization: result.payload,
          status: undefined,
        };
      }
      return {
        authorization: undefined,
        status: Statuses.UNAUTHORIZED,
      };
    } catch (err) {
      if (!(err instanceof Error)) throw err;
      switch (err.name) {
        case 'JWTClaimInvalid':
        case 'JWSInvalid':
        case 'JWSSignatureVerificationFailed':
          log.warn(err.message);
          return {
            authorization: undefined,
            status: Statuses.FORBIDDEN,
          };
        case 'JWTMalformed':
          log.warn(err.message);
          return {
            authorization: undefined,
            status: Statuses.UNAUTHORIZED,
          };
        default:
          log.error(err);
          return {
            authorization: undefined,
            status: Statuses.UNAUTHORIZED,
          };
      }
    }
  }

  public middleware(): Middleware<any, AuthorizationContext> & Router.Middleware<any, AuthorizationContext> {
    return async (ctx: AuthorizationContext, next: Application.Next): Promise<void> => {
      const { status, authorization } = await this.getAuthorization(ctx.request.headers, ctx.logger || debug);
      if (status) {
        ctx.status = status;
        if (!this.options?.continueOnUnauthorized) return;
      }
      if (this.options?.check && !(await this.options.check(authorization, ctx))) {
        ctx.status = Statuses.FORBIDDEN;
        return;
      }
      ctx.authorization = authorization;
      await next();
    };
  }

  protected abstract getSecretOrPublicKey(token: string): Promise<KeyLike | JWTVerifyGetKey>;
}

export class JwtAuthentication extends BaseJwtAuthentication {
  constructor(
    private readonly secretOrPublicKey: string | Buffer,
    options?: Options,
  ) {
    super(options);
  }

  protected getSecretOrPublicKey(): Promise<KeyLike | JWTVerifyGetKey> {
    return Promise.resolve(createSecretKey(Buffer.from(this.secretOrPublicKey)));
  }
}

export class JwtJwksAuthentication extends BaseJwtAuthentication {
  private cache: LRU<string, KeySet>;

  constructor(
    options?: Options,
  ) {
    super(options);
    this.cache = new LRU<string, KeySet>({
      max: 500,
      maxAge: Time.hours(1),
      ...options?.cacheOptions,
    });
  }

  protected async getSecretOrPublicKey(token: string): Promise<KeyLike | JWTVerifyGetKey> {
    const { header, payload } = Jwt.decode(token);
    if (!payload.iss?.startsWith('https://') || !header.kid) throw new Error("Token doesn't support JWKS");

    return this.getKeySet(payload.iss);
  }

  private async getKeySet(issuer: string): Promise<KeySet> {
    const cached = this.cache.get(issuer);
    if (cached) return cached;

    const configUrl = new URL('./.well-known/openid-configuration', issuer).toString();
    const { data: configuration } = await axios.get<OpenidConfiguration>(configUrl);

    const jwks = createRemoteJWKSet(new URL(configuration.jwks_uri));
    this.cache.set(issuer, jwks);
    return jwks;
  }
}
