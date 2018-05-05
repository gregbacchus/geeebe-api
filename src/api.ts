import { Statuses } from '@geeebe/common';
import { logger } from '@geeebe/logging';
import { Context } from 'koa';
import { IRouterContext } from 'koa-router';

import Router = require('koa-router');
import _ = require('underscore');

const debug = logger.child({ module: 'common:api:base' });

export abstract class Api extends Router {

  //noinspection JSUnusedGlobalSymbols
  /**
   * Formats the given error into the Koa context - Should never throw any exception
   * @param {object} ctx - koa.js context
   * @param {string} ctx.request.url - URL of original requires
   * @param {number} ctx.status - HTTP response status
   * @param {function} ctx.set - set response header
   * @param {*} ctx.body - HTTP response body
   * @param {Error} err - error to format
   * @param {object[]} [err.errors] - validation errors
   */
  public static formatError(ctx: IRouterContext | Context, err: any): void {
    const data: any = { type: err.name, message: err.message };

    switch (err.name) {
      case 'ValidationError':
        debug(`${ctx.request.method} ${ctx.request.url}`, { errors: err.errors, errorMessage: err.message });
        if (err.errors) {
          data.failures = [];
          _.values(err.errors).forEach((error) => {
            data.failures.push({ message: error.kind, parameter: error.path });
          });
        }
        ctx.status = Statuses.BAD_REQUEST;
        break;
      case 'UnauthorizedError':
        ctx.set('Cache-Control', 'max-age=0');
        ctx.set('Pragma', 'no-cache');
        ctx.status = err.status || Statuses.UNAUTHORIZED;
        break;
      default:
        debug(`${ctx.request.method} ${ctx.request.url}`, err);
        ctx.set('Cache-Control', 'max-age=0');
        ctx.set('Pragma', 'no-cache');
        ctx.status = err.status || Statuses.SERVER_ERROR;
        break;
    }
    ctx.body = { error: data };
  }

  public auth: any;

  /**
   * Create API
   */
  constructor(
    parent: Router,
    protected readonly path: string,
    options?: { skipAddRoute: boolean },
  ) {
    super();

    if (!options || !options.skipAddRoute) {
      this.addRoutes();
      parent.use(path || '', this.routes(), this.allowedMethods());
    }
  }

  /**
   * Override to add the routes for this API
   * @return {void}
   */
  protected abstract addRoutes(): void;
}
