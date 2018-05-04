import { Statuses } from '@geeebe/common';
import { optimizeAnd, Projection, Query, Sort } from '@geeebe/data';
import { StringChildValidator } from 'better-validator/src/IsObject';
import { Koa2Middleware } from 'better-validator/src/middleware/Koa2Middleware';
import { IRouterContext } from 'koa-router';
import { Document, Model } from 'mongoose';
import { Shared } from './shared';

import Router = require('koa-router');
import underscore = require('underscore');

const DEFAULT_LIMIT = undefined;
const ONE_CHAR = 1;

export declare interface IReadableApi {

  // assertAccess(required?: string): IMiddleware;
  checkReadOneQuery(query: StringChildValidator): void;
  checkReadManyQuery(query: StringChildValidator): void;
  makeProjection(ctx: IRouterContext): Projection;
  makeReadOneQuery(ctx: IRouterContext, defaultAnd?: Query[]): Promise<Query>;
  makeReadManyQuery(ctx: IRouterContext): Promise<Query>;
  makeSort(ctx: IRouterContext): any;
  makeSkip(ctx: IRouterContext): number;
  makeLimit(ctx: IRouterContext): number | undefined;
  groomReadResponse(ctx: IRouterContext, item: any): any;
  readOne(ctx: IRouterContext): Promise<void>;
  readMany(ctx: IRouterContext): Promise<void>;
}

export namespace Readable {

  export const DEFAULT_PAGE_SIZE = 100;
  export const DEFAULT_SKIP = 0;
  export const PROJECTION_INCLUDE = 1;

  export async function setRoutes(router: Router, api: IReadableApi, check: Koa2Middleware) {
    router.get('/:id', /* api.assertAccess(), */
      check.params(Shared.checkAccessOneParams),
      check.query(api.checkReadOneQuery.bind(api)),
      api.readOne.bind(api));

    router.get('/', /* api.assertAccess(), */
      check.params(Shared.checkAccessManyParams),
      check.query(api.checkReadManyQuery.bind(api)),
      api.readMany.bind(api));
  }

  //noinspection JSUnusedLocalSymbols
  export function checkReadOneQuery(_: StringChildValidator): void {
    // TODO
    // projection
    // query
  }

  //noinspection JSUnusedLocalSymbols
  export function checkReadManyQuery(_: StringChildValidator): void {
    // TODO
    // projection
    // query
    // sorting
    // pagination
  }

  /**
   * Get projection from request
   */
  export function makeProjection(ctx: IRouterContext, defaultProjection: Projection): Projection {
    // GET /items?fields=email,address.country
    const projection = underscore.clone(defaultProjection);

    if (ctx.query.q) {
      projection.score = { $meta: 'textScore' };
    }

    const fields = ctx.query.fields;
    if (!fields) return projection;
    if (fields === '*') return {};

    for (const field of fields.split(/\s*,\s*/)) {
      if (!field) continue;

      if (field.startsWith('+')) {
        projection[field.slice(ONE_CHAR)] = Readable.PROJECTION_INCLUDE;
      } else if (field.startsWith('-')) {
        delete projection[field.slice(ONE_CHAR)];
      } else {
        projection[field] = Readable.PROJECTION_INCLUDE;
      }
    }

    if (ctx.query.origin) {
      projection.origin = Readable.PROJECTION_INCLUDE;
    }
    return projection;
  }

  /**
   * Get query for single item from request
   * @param {object} ctx - koa.js context
   * @param {string} ctx.params.id - requested id
   * @param {string} [ctx.query.id-name] - field to be used for id match
   * @param {Array} defaultAnd - Optional specific and condition
   * @return {object} MongoDB query
   */
  export async function makeReadOneQuery(ctx: IRouterContext, defaultAnd?: Query[]): Promise<Query> {
    // GET /item/00000000-0000-0000-0000-000000000000
    // GET /item/me@home.com?id-name=email
    const $and: Query[] = defaultAnd || [];

    const id = ctx.params.id;
    if (ctx.query.origin) {
      $and.push({ 'origin.source': ctx.query.origin });
      $and.push({ 'origin.id': id });
    } else if (ctx.query['id-name']) {
      $and.push({ [ctx.query['id-name']]: id });
    } else {
      $and.push({ _id: id });
    }

    return optimizeAnd($and);
  }

  /**
   * Generate a text search query for the given text
   * @param {object} ctx - koa.js context
   * @param {string} find - text to find
   * @param {string[]} searchFields - fields to search
   * @return {object} database query
   */
  export async function makeSearchQuery(_: IRouterContext, find: string, searchFields: string[]): Promise<Query> {
    const language = null; // TODO??
    const textSearch: Query = {
      $text: {
        $language: language && /^[a-z]{2}?$/.test(language) ? language : 'en',
        $search: find,
      },
    };
    if (/^\w+$/.test(find)) {
      const $or = [textSearch];
      for (const field of searchFields) {
        $or.push({
          [field]: new RegExp(find, 'i'),
        });
      }
      return { $or };
    }
    return textSearch;
  }

  /**
   * Get query for list of items from request
   * @param {object} ctx - koa.js context
   * @param {string|[string]} [ctx.query.id] - ids to limit result to
   * @param {string} [ctx.query.q] - text search query
   * @param {string} [ctx.params.accountId] - account id
   * @param {string} [ctx.query.account-id] - account id
   * @param {string[]} searchFields - fields to search
   * @return {object} MongoDB query
   */
  export async function makeReadManyQuery(ctx: IRouterContext, searchFields: string[]): Promise<Query> {
    // GET /
    // GET /?id=00000000-0000-0000-0000-000000000001&id=00000000-0000-0000-0000-000000000002
    // GET /?id=me@home.com&id-name=you@home.com&id-name=email
    // GET /?id=ibd-id1&id=ibd-id1&origin=ibd
    const $and: Query[] = [];

    const ids = Array.isArray(ctx.query.id) && ctx.query.id || ctx.query.id && [ctx.query.id] || [];
    if (ids.length) {
      if (ctx.query.origin) {
        $and.push({ 'origin.source': ctx.query.origin });
        $and.push({ 'origin.id': { $in: ids } });
      } else {
        const idName = ctx.query['id-name'] || '_id';
        $and.push({ [idName]: { $in: ids } });
      }
    }

    if (ctx.query.q) {
      const query = await Readable.makeSearchQuery(ctx, ctx.query.q, searchFields);
      query && $and.push(query);
    }

    return optimizeAnd($and);
  }

  /**
   * Get sort operand from request
   * @param {object} ctx - koa.js context
   * @param {string} ctx.query.sort - list of fields to be sorted
   * @param {string[]} searchFields - fields to search
   * @return {object} MongoDB sort
   */
  export function makeSort(ctx: IRouterContext, searchFields: string[]): any {
    const fields = ctx.query.sort;
    const sort: any = {};
    if (!fields) {
      if (ctx.query.q) {
        sort.score = { $meta: 'textScore' };
      }
      for (const field of searchFields) {
        sort[field] = Sort.ASCENDING;
      }

      return sort;
    }

    for (const field of fields.split(/\s*,\s*/)) {
      if (!field) continue;

      if (field.startsWith('+')) {
        sort[field.slice(ONE_CHAR)] = Sort.ASCENDING;
      } else if (field.startsWith('-')) {
        sort[field.slice(ONE_CHAR)] = Sort.DESCENDING;
      } else {
        sort[field] = Sort.ASCENDING;
      }
    }
    return sort;
  }

  /**
   * Get number of items to skip from request (either by pages, or specifically)
   * @return {number} items to skip
   */
  export function makeSkip(ctx: IRouterContext): number {
    const skip = Number(ctx.query.skip) || Readable.DEFAULT_SKIP;
    const page = Number(ctx.query.page) || 1;
    const pageSize = Number(ctx.query.pagesize) || Readable.DEFAULT_PAGE_SIZE;
    return skip + (page - 1) * pageSize;
  }

  /**
   * Get limit of items to be returned from request (either by pages, or specifically)
   * @return {number} items to return
   */
  export function makeLimit(ctx: IRouterContext): number | undefined {
    const pageSize: number = Number(ctx.query.pagesize) || Readable.DEFAULT_PAGE_SIZE;
    const limit: number | undefined = Number(ctx.query.limit) || DEFAULT_LIMIT;
    return Number(ctx.query.page) ? pageSize : limit;
  }

  /**
   * Read a single item
   */
  export async function readOne(api: IReadableApi, model: Model<Document>, ctx: IRouterContext): Promise<void> {
    const query = await api.makeReadOneQuery(ctx);
    const options = {
      skip: api.makeSkip(ctx),
      sort: api.makeSort(ctx),
    };
    const item: Document | null = await model.findOne(query, api.makeProjection(ctx), options);
    if (!item) {
      ctx.status = Statuses.NOT_FOUND;
      return;
    }

    ctx.body = api.groomReadResponse(ctx, item.toJSON());
  }

  //noinspection JSUnusedGlobalSymbols
  /**
   * Formats the given item list into the Koa context
   */
  export async function formatListResult(ctx: IRouterContext, items: any[], skip: number, limit: number | undefined, totalMatched: number) {
    const meta: any = { matched: totalMatched };
    if (Number(ctx.query.page)) {
      meta.page = Number(ctx.query.page);
      meta.pagesize = Number(ctx.query.pagesize) || Readable.DEFAULT_PAGE_SIZE;
      meta.pagecount = Math.ceil(totalMatched / meta.pagesize);
    } else {
      meta.skip = skip;
      meta.limit = limit;
    }
    ctx.body = Object.assign({ items }, meta);
  }

  /**
   * List items
   */
  export async function readMany(api: IReadableApi, model: Model<Document>, ctx: IRouterContext): Promise<void> {
    const query = await api.makeReadManyQuery(ctx);
    const options = {
      limit: api.makeLimit(ctx),
      score: { $meta: 'textScore' },
      skip: api.makeSkip(ctx),
      sort: api.makeSort(ctx),
    };
    const matched = await model.count(query);
    const items: Document[] = await model.find(query, api.makeProjection(ctx), options);
    Readable.formatListResult(ctx, items.map((item) => api.groomReadResponse(ctx, item.toJSON())),
      options.skip, options.limit, matched);
  }
}
