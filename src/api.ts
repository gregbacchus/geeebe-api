import { Statuses } from '@geeebe/common';
import { logger, WithLogger } from '@geeebe/logging';
import { WithSpan } from '@geeebe/service';

import Router = require('koa-router');

const debug = logger.child({ module: 'api:base' });

type ApiContext = Router.RouterContext & WithLogger & WithSpan;

/**
 * Usage:
 *   new ClientScope('/parent/:parentId').mount(
 *     parentRouter,
 *     new ChildApi('/child'),
 *     new FooApi('/foo'),
 *   );
 */
export class ApiScope extends Router {
  constructor(path?: string, options?: Router.IRouterOptions) {
    super({ prefix: path, ...options });
  }

  public mount(parent: Router, ...children: Api[]) {
    children.forEach((child) => child.mount(this));
    parent.use(this.routes(), this.allowedMethods());
  }
}

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
  public static formatError(ctx: ApiContext, err: any): void {
    const data: any = { type: err.name, message: err.message };

    switch (err.name) {
      case 'ValidationError':
        debug(`${ctx.request.method} ${ctx.request.url}`, { errors: err.errors, errorMessage: err.message });
        if (err.errors) {
          data.failures = err.errors.map(
            (error: any) => ({ message: error.kind, parameter: error.path }),
          );
        }
        ctx.status = Statuses.BAD_REQUEST;
        break;
      case 'UnauthorizedError':
        ctx.set('Cache-Control', 'max-age=0');
        ctx.set('Pragma', 'no-cache');
        ctx.status = err.status || Statuses.UNAUTHORIZED;
        break;
      default:
        debug(`${ctx.request.method} ${ctx.request.url}`, { error: err });
        ctx.set('Cache-Control', 'max-age=0');
        ctx.set('Pragma', 'no-cache');
        ctx.status = err.status || Statuses.SERVER_ERROR;
        break;
    }
    ctx.body = { error: data };
  }

  /**
   * Create API
   * @param path - Path to mount this API inside the router
   */
  constructor(path?: string, options?: Router.IRouterOptions) {
    super({ prefix: path, ...options });
  }

  public mount(parent: Router) {
    this.mountRoutes();
    parent.use(this.routes(), this.allowedMethods());
  }

  /**
   * Override to add the routes for this API
   * @return {void}
   */
  protected abstract mountRoutes(): void;
}

export abstract class ControllerApi<T> extends Api {
  protected abstract createController(ctx: ApiContext): T;

  protected withController = (endpoint: (controller: T, ctx: ApiContext) => Promise<void>) =>
    async (ctx: ApiContext): Promise<void> => {
      const controller: T = this.createController(ctx);
      return endpoint(controller, ctx);
    }
}
