import { Service } from '@geeebe/service';
import { Api, ApiContext } from './api';
import { KoaService, ServiceOptions } from './koa-service';
import Router = require('@koa/router');

export class ApiService<StateT = any, CustomT = ApiContext> extends KoaService<ServiceOptions, StateT, CustomT> {
  public static create(port: number | string, ...apis: Api[]): Service {
    return new ApiService(apis, { port });
  }

  constructor(private readonly apis: Api<StateT, CustomT>[], options: ServiceOptions) {
    super(options);
  }

  protected mountApi(router: Router<StateT, CustomT>): void {
    this.apis.forEach((api) => api.mount(router));
  }
}
