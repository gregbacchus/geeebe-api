import { WithLogger } from '@geeebe/logging';
import * as Router from '@koa/router';

interface WithRequestBody {
  request: Request & { body: unknown };
}

export type RequestHeaders = Record<string, string | string[] | undefined>;

interface WithRequestHeaders {
  request: Request & { headers: RequestHeaders };
}

export type ExtraContext = WithLogger & WithRequestBody & WithRequestHeaders;
export type ApiContext = Router.RouterContext<any, ExtraContext>;

/**
 * Usage:
 *   new ClientScope('/parent/:parentId').mount(
 *     parentRouter,
 *     new ChildApi('/child'),
 *     new FooApi('/foo'),
 *   );
 */
export class ApiScope<StateT = any, CustomT = ExtraContext> extends Router<StateT, CustomT> {
  constructor(path?: string, options?: Router.RouterOptions) {
    super({ prefix: path, ...options });
  }

  public mount(parent: Router<StateT, CustomT>, ...children: Array<Api<StateT, CustomT>>): void {
    children.forEach((child) => child.mount(this));
    parent.use(this.routes(), this.allowedMethods());
  }
}

export abstract class Api<StateT = any, CustomT = ExtraContext> extends Router<StateT, CustomT> {
  /**
   * Create API
   * @param path - Path to mount this API inside the router
   */
  constructor(path?: string, options?: Router.RouterOptions) {
    super({ prefix: path, ...options });
  }

  public mount(parent: Router<StateT, CustomT>): void {
    this.mountRoutes();
    parent.use(this.routes(), this.allowedMethods());
  }

  /**
   * Override to add the routes for this API
   * @return {void}
   */
  protected abstract mountRoutes(): void;
}

export abstract class ControllerApi<T, StateT = any, CustomT = ExtraContext> extends Api<StateT, CustomT> {
  protected abstract createController(ctx: ApiContext): T;

  protected withController = (endpoint: (controller: T, ctx: ApiContext) => Promise<void>) =>
    async (ctx: ApiContext): Promise<void> => {
      const controller: T = this.createController(ctx);
      return endpoint(controller, ctx);
    }
}
