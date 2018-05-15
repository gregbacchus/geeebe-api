import { Statuses } from '@geeebe/common';
import { optimizeAnd, Query } from '@geeebe/data';
import { ChildValidator, StringChildValidator } from 'better-validator/src/IsObject';
import { Koa2Middleware } from 'better-validator/src/middleware/Koa2Middleware';
import { IRouterContext } from 'koa-router';
import { Document, Model } from 'mongoose';

import Router = require('koa-router');

export declare interface IDeletableApi {

  // assertAccess(required?: string): IMiddleware;
  checkDeleteOneBody(body: ChildValidator): void;
  checkDeleteOneParams(params: StringChildValidator): void;
  checkDeleteOneQuery(query: StringChildValidator): void;
  checkRestoreOneBody(body: ChildValidator): void;
  checkRestoreOneParams(params: StringChildValidator): void;
  checkRestoreOneQuery(query: StringChildValidator): void;
  makeWriteOneQuery(ctx: IRouterContext, defaultAnd?: Query[]): Promise<Query>;
  onDeleted(id: string): Promise<void>;
  onCreated(item: Document): Promise<void>;
  deleteOne(ctx: IRouterContext): Promise<void>;
  restoreOne(ctx: IRouterContext): Promise<void>;
}

export namespace Deletable {

  export function setRoutes(router: Router, api: IDeletableApi, check: Koa2Middleware) {
    router.delete('/:id', /* api.assertAccess('d'), */
      check.params(api.checkDeleteOneParams.bind(api)),
      check.body(api.checkDeleteOneBody.bind(api)),
      check.query(api.checkDeleteOneQuery.bind(api)),
      api.deleteOne.bind(api));

    router.post('/:id', /* api.assertAccess('cd'), */
      check.params(api.checkRestoreOneParams.bind(api)),
      check.body(api.checkRestoreOneBody.bind(api)),
      check.query(api.checkRestoreOneQuery.bind(api)),
      api.restoreOne.bind(api));
  }

  /**
   * Get query for write access to single item from request
   * @return {Query} MongoDB query
   */
  export async function makeWriteOneQuery(ctx: IRouterContext, defaultAnd?: Query[]): Promise<Query> {
    // GET /item/00000000-0000-0000-0000-000000000000
    // GET /item/me@home.com?id-name=email
    const $and: Query[] = defaultAnd || [];

    const id = ctx.params.id;
    if (ctx.query['id-name']) {
      $and.push({ [ctx.query['id-name']]: id });
    } else {
      $and.push({ _id: id });
    }

    return optimizeAnd($and);
  }

  /**
   * Delete a item. Response is success or failure
   */
  export async function deleteOne(api: IDeletableApi, model: Model<Document> & any, ctx: IRouterContext): Promise<void> {
    const query = await api.makeWriteOneQuery(ctx);
    const result = await model.delete(query);

    const found = result.n > 0; // eslint-disable-line id-length
    ctx.body = { count: result.n };
    ctx.status = found ? Statuses.OK : Statuses.NOT_FOUND;

    if (result.nModified > 0) {
      await api.onDeleted(ctx.params.id);
    }
  }

  /**
   * Restore a soft deleted item. Response is success or failure
   */
  export async function restoreOne(api: IDeletableApi, model: Model<Document> & any, ctx: IRouterContext): Promise<void> {
    const query = await api.makeWriteOneQuery(ctx);
    const result = await model.restore(query);

    const found = result.n > 0; // eslint-disable-line id-length
    if (found) {
      const item = await model.findOne(query);
      if (item) {
        ctx.body = { id: item._id, restored: true };
        ctx.status = Statuses.CREATED;

        if (result.nModified > 0) {
          await api.onCreated(item);
        }
        return;
      }
    }

    ctx.body = { restored: false };
    ctx.status = Statuses.NOT_FOUND;
  }
}
