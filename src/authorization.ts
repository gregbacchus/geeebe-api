import { Statuses, Time } from '@geeebe/common';
import { logger, Logger } from '@geeebe/logging';
import axios from 'axios';
import { ConsumeKeyInput, JSONWebKeySet, JWKS, JWT } from 'jose';
import { Context, Middleware } from 'koa';

import Router = require('koa-router');
import LRU = require('lru-cache');

const TOKEN_EXTRACTOR = /^Bearer (.*)$/;
const debug = logger.child({ module: 'api:authorization' });

export interface MaybeWithAuthorization {
  authorization?: any;
}

export interface AuthorizationContext extends Context, MaybeWithAuthorization {
}

export type CheckToken = (authorization: any, ctx: Context) => Promise<boolean>;

export interface VerifyOptions {
  complete: false;
  ignoreExp?: boolean;
  ignoreNbf?: boolean;
  ignoreIat?: boolean;
  maxTokenAge?: string;
  subject?: string;
  issuer?: string;
  maxAuthAge?: string;
  jti?: string;
  clockTolerance?: string;
  audience?: string | string[];
  algorithms?: string[];
  nonce?: string;
  now?: Date;
  crit?: string[];

  check?: CheckToken;
  cacheOptions?: LRU.Options<string, Keys>;
}

export interface JwtHeader {
  alg: string;
  typ: 'JWT';
  kid?: string;
}

export interface JwtPayload {
  sub: string;
  aub: string;
  iss: string;
}

interface OpenidConfiguration {
  jwks_uri: string;
}

interface Key {
  /** The unique identifier for the key. */
  kid: string;
  /** The matching public key */
  publicKey: string;
}

interface Keys {
  [kid: string]: Key;
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
        return JWT.decode(token) || undefined;
      }
    } catch (err) {
      debug.error(err);
    }
    return undefined;
  }

  constructor() { }

  public middleware(): Router.IMiddleware;
  public middleware(): Middleware {
    return async (ctx: AuthorizationContext, next): Promise<void> => {
      ctx.authorization = JwtDecoder.getAuthorization(ctx.request.headers);
      await next();
    };
  }
}

abstract class BaseJwtAuthentication {
  constructor(
    protected readonly verifyOptions?: VerifyOptions,
  ) { }

  public async getAuthorization(headers: any, logger: Logger): Promise<AuthorizationSuccess | AuthorizationFailure> {
    try {
      // decode token
      const token = Jwt.getBearerToken(headers);
      if (token) {
        return {
          authorization: JWT.verify(token, await this.getSecretOrPublicKey(token), this.verifyOptions),
          status: undefined,
        };
      }
      return {
        authorization: undefined,
        status: Statuses.UNAUTHORIZED,
      };
    } catch (err) {
      switch (err.name) {
        case 'JWTClaimInvalid':
          logger(err.message);
          return {
            authorization: undefined,
            status: Statuses.FORBIDDEN,
          };
        case 'JWTMalformed':
          logger(err.message);
          return {
            authorization: undefined,
            status: Statuses.UNAUTHORIZED,
          };
        default:
          logger.error(err);
          return {
            authorization: undefined,
            status: Statuses.UNAUTHORIZED,
          };
      }
    }
  }

  public middleware(): Router.IMiddleware;
  public middleware(): Middleware {
    return async (ctx: AuthorizationContext, next): Promise<void> => {
      const { status, authorization } = await this.getAuthorization(ctx.request.headers, ctx.logger || debug);
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

  protected abstract getSecretOrPublicKey(token: string): Promise<ConsumeKeyInput>;
}

export class JwtAuthentication extends BaseJwtAuthentication {
  constructor(
    private readonly secretOrPublicKey: string | Buffer,
    verifyOptions?: VerifyOptions,
  ) {
    super(verifyOptions);
  }

  protected async getSecretOrPublicKey(): Promise<ConsumeKeyInput> {
    return this.secretOrPublicKey;
  }
}

export class JwtJwksAuthentication extends BaseJwtAuthentication {
  private cache: LRU<string, Keys>;

  constructor(
    verifyOptions?: VerifyOptions,
  ) {
    super(verifyOptions);
    this.cache = new LRU<string, Keys>({
      max: 500,
      maxAge: Time.hours(1),
      ...verifyOptions?.cacheOptions,
    });
  }

  protected async getSecretOrPublicKey(token: string): Promise<ConsumeKeyInput> {
    const { header, payload } = JWT.decode(token, { complete: true }) as { header: JwtHeader, payload: JwtPayload };
    if (!payload.iss.startsWith('https://') || !header.kid) throw new Error("Token doesn't support JWKS");

    const keys = await this.getKeys(payload.iss);

    const matchedKey = keys.hasOwnProperty(header.kid) ? keys[header.kid] : null;
    if (!matchedKey) throw new Error(`Unable to ind matching key for iss=${payload.iss} kid=${header.kid}`);
    return matchedKey.publicKey;
  }

  private async getKeys(issuer: string): Promise<Keys> {
    if (this.cache.has(issuer)) return this.cache.get(issuer)!;

    const configUrl = new URL('./.well-known/openid-configuration', issuer).toString();
    const { data: configuration } = await axios.get<OpenidConfiguration>(configUrl);

    const { data: jwks } = await axios.get<JSONWebKeySet>(configuration.jwks_uri);
    const keyStore = JWKS.asKeyStore(jwks);
    const keys = keyStore.all({ kty: 'RSA' })
      .filter((key) => key.use === 'sig' && key.kid)
      .map((key): Key => {
        return { kid: key.kid, publicKey: key.toPEM() };
      })
      .reduce((acc, key) => ({ ...acc, [key.kid]: key }), {} as Keys);
    this.cache.set(issuer, keys);
    return keys;
  }
}
