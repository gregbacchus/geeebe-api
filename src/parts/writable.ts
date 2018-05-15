import { Statuses } from '@geeebe/common';
import { optimizeAnd, Query } from '@geeebe/data';
import { ChildValidator, StringChildValidator } from 'better-validator/src/IsObject';
import { Koa2Middleware } from 'better-validator/src/middleware/Koa2Middleware';
import { IRouterContext } from 'koa-router';
import { Document, Model } from 'mongoose';

import Router = require('koa-router');

export declare interface IWritableApi {

  // assertAccess(required?: string): IMiddleware;
  checkCreateOneBody(body: ChildValidator): void;
  checkCreateOneParams(query: StringChildValidator): void;
  checkCreateOneQuery(query: StringChildValidator): void;
  checkUpdateOneBody(body: ChildValidator): void;
  checkUpdateOneParams(query: StringChildValidator): void;
  checkUpdateOneQuery(query: StringChildValidator): void;
  makeWriteOneQuery(ctx: IRouterContext, defaultAnd?: Query[]): Promise<Query>;
  createId(ctx: IRouterContext): string;
  groomCreate(item: any, id: string): Promise<{ _id: string }>;
  onCreated(item: Document): Promise<void>;
  groomUpdate(item: any): Promise<any>;
  onUpdated(item: Document): Promise<void>;
  createOne(ctx: IRouterContext): Promise<void>;
  updateOne(ctx: IRouterContext): Promise<void>;
}

export namespace Writable {

  export function setRoutes(router: Router, api: IWritableApi, check: Koa2Middleware) {
    router.post('/', /* api.assertAccess('c'), */
      check.params(api.checkCreateOneParams.bind(api)),
      check.body(api.checkCreateOneBody.bind(api)),
      check.query(api.checkCreateOneQuery.bind(api)),
      api.createOne.bind(api));

    router.put('/:id', /* api.assertAccess('u'), */
      check.params(api.checkUpdateOneParams.bind(api)),
      check.body(api.checkUpdateOneBody.bind(api)),
      check.query(api.checkUpdateOneQuery.bind(api)),
      api.updateOne.bind(api));
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
   * Create a new item. Response is `id` of item created
   */
  export async function createOne(api: IWritableApi, model: Model<Document>, ctx: IRouterContext): Promise<void> {
    const id = api.createId(ctx);

    const request: any = ctx.request;
    let data = request.body;
    data = (await api.groomUpdate(data)) || data;
    data = (await api.groomCreate(data, id)) || data;
    const item = new model(data);
    await item.save();
    ctx.body = { _id: item._id };
    ctx.status = Statuses.CREATED;

    await api.onCreated(item);
  }

  /**
   * Update an item. Response is `id` of item created
   */
  export async function updateOne(api: IWritableApi, model: Model<Document>, ctx: IRouterContext): Promise<void> {
    const query = await api.makeWriteOneQuery(ctx);
    const request: any = ctx.request;
    let data = request.body;
    data = (await api.groomUpdate(data)) || data;
    const loaded: Document | null = await model.findOne(query);
    if (!loaded) {
      const create = ctx.query.create === 'true';
      if (!create) {
        ctx.body = { count: 0 };
        ctx.status = Statuses.NOT_FOUND;
        return;
      }

      // TODO validate create request
      const id = ctx.params.id;
      data = (await api.groomCreate(data, id)) || data;
      const item = new model(data);
      await item.save();
      ctx.body = { _id: item._id };
      ctx.status = Statuses.CREATED;

      await api.onCreated(item);
      return;
    }

    loaded.set(data);
    const isModified = loaded.isModified();
    if (isModified) {
      await loaded.save();
    }

    ctx.body = { updated: isModified };
    ctx.status = Statuses.OK;

    if (isModified) {
      await api.onUpdated(loaded);
    }
  }
}
