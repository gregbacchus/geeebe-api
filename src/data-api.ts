import { ChildValidator, StringChildValidator } from 'better-validator/src/IsObject';
import { Koa2Middleware } from 'better-validator/src/middleware/Koa2Middleware';
import { IRouterContext } from 'koa-router';
import { Document, Model } from 'mongoose';
// import { Projection, Query } from '../data';
import { Api } from './api';
import { Deletable, IDeletableApi } from './parts/deletable';
import { IReadableApi, Readable } from './parts/readable';
import { Shared } from './parts/shared';
import { IWritableApi, Writable } from './parts/writable';

import Router = require('koa-router');
import uuid = require('uuid');

export declare type Query = any;
export declare type Projection = any;

const DEFAULT_PROJECTION = { _id: 1 };

//noinspection JSUnusedGlobalSymbols
/**
 * An Api class responsible for routing and mapping queries to the mongodb crud functions.
 * composeListQuery() could be overridden to provide more customized query parsing and add constraints.
 */
export class DataApi<TEntity extends Document>
  extends Api
  implements IReadableApi, IWritableApi, IDeletableApi {

  protected readonly projection: Projection = DEFAULT_PROJECTION;
  protected readonly searchFields = ['name'];

  /**
   * Create API which implement basic CRUD functionalities by mongoose
   * @param parent - Parent Route
   * @param path - Path to mount this API inside the parent router
   * @param model - Mongoose object to work with data
   */
  constructor(
    parent: Router,
    path: string,
    protected readonly model: Model<TEntity>,
    public readonly check: Koa2Middleware,
  ) {
    super(parent, path, { skipAddRoute: true });

    this.addRoutes();
    parent.use(path || '', this.routes(), this.allowedMethods());
  }

  public addRoutes(): void {
    Readable.setRoutes(this, this, this.check);
    Writable.setRoutes(this, this, this.check);
    Deletable.setRoutes(this, this, this.check);
  }

  //noinspection JSMethodCanBeStatic
  public checkReadOneParams(params: StringChildValidator) {
    Shared.checkAccessOneParams(params);
  }

  //noinspection JSMethodCanBeStatic
  public checkReadOneQuery(query: StringChildValidator) {
    Readable.checkReadOneQuery(query);
  }

  //noinspection JSMethodCanBeStatic
  public checkReadManyParams(params: StringChildValidator) {
    Shared.checkAccessOneParams(params);
  }

  //noinspection JSMethodCanBeStatic
  public checkReadManyQuery(query: StringChildValidator) {
    Readable.checkReadManyQuery(query);
  }

  //noinspection JSUnusedLocalSymbols
  public checkCreateOneBody(_: ChildValidator) {
  }

  //noinspection JSUnusedLocalSymbols
  public checkCreateOneParams(params: StringChildValidator) {
    Shared.checkAccessOneParams(params);
  }

  //noinspection JSUnusedLocalSymbols
  public checkCreateOneQuery(_: StringChildValidator) {
  }

  //noinspection JSUnusedLocalSymbols
  public checkUpdateOneBody(_: ChildValidator) {
  }

  //noinspection JSUnusedLocalSymbols
  public checkUpdateOneParams(params: StringChildValidator) {
    Shared.checkAccessOneParams(params);
  }

  //noinspection JSUnusedLocalSymbols
  public checkUpdateOneQuery(_: StringChildValidator) {
  }

  //noinspection JSMethodCanBeStatic
  public checkDeleteOneBody(body: ChildValidator) {
    body().strict();
  }

  //noinspection JSUnusedLocalSymbols
  public checkDeleteOneParams(params: StringChildValidator) {
    Shared.checkAccessOneParams(params);
  }

  //noinspection JSUnusedLocalSymbols
  public checkDeleteOneQuery(_: StringChildValidator) {
  }

  //noinspection JSMethodCanBeStatic
  public checkRestoreOneBody(body: ChildValidator) {
    body().strict();
  }

  //noinspection JSUnusedLocalSymbols
  public checkRestoreOneParams(params: StringChildValidator) {
    Shared.checkAccessOneParams(params);
  }

  //noinspection JSUnusedLocalSymbols
  public checkRestoreOneQuery(_: StringChildValidator) {
  }

  /**
   * Get projection from request
   * @return {Projection} MongoDB projection
   */
  public makeProjection(ctx: IRouterContext): Projection {
    return Readable.makeProjection(ctx, this.projection);
  }

  //noinspection JSMethodCanBeStatic
  /**
   * Get query for single item from request
   * @return {Query} MongoDB query
   */
  public async makeReadOneQuery(ctx: IRouterContext, defaultAnd?: Query[]): Promise<Query> {
    return Readable.makeReadOneQuery(ctx, defaultAnd);
  }

  // noinspection JSMethodCanBeStatic
  /**
   * Get query for list of items from request
   * @return {object} MongoDB query
   */
  public async makeReadManyQuery(ctx: IRouterContext): Promise<Query> {
    return Readable.makeReadManyQuery(ctx, this.searchFields);
  }

  //noinspection JSMethodCanBeStatic
  /**
   * Get query for write access to single item from request
   * @return {Query} MongoDB query
   */
  public async makeWriteOneQuery(ctx: IRouterContext, defaultAnd?: Query[]): Promise<Query> {
    return await Writable.makeWriteOneQuery(ctx, defaultAnd);
  }

  /**
   * Get sort operand from request
   * @return {object} MongoDB sort
   */
  public makeSort(ctx: IRouterContext): any {
    return Readable.makeSort(ctx, this.searchFields);
  }

  // noinspection JSMethodCanBeStatic
  /**
   * Get number of items to skip from request (either by pages, or specifically)
   * @return {number} items to skip
   */
  public makeSkip(ctx: IRouterContext): number {
    return Readable.makeSkip(ctx);
  }

  // noinspection JSMethodCanBeStatic
  /**
   * Get limit of items to be returned from request (either by pages, or specifically)
   * @return {number} items to return
   */
  public makeLimit(ctx: IRouterContext): number | undefined {
    return Readable.makeLimit(ctx);
  }

  // noinspection JSUnusedLocalSymbols, JSMethodCanBeStatic
  /**
   * Create new id for new item
   */
  public createId(_: IRouterContext): string { // eslint-disable-line no-unused-vars
    return uuid.v4();
  }

  // noinspection JSMethodCanBeStatic
  /**
   * Groom item for creation
   */
  public async groomCreate(item: any, id: string): Promise<{ _id: string }> {
    return Object.assign(item, { _id: id });
  }

  // noinspection JSMethodCanBeStatic
  /**
   * Groom item before creation or update
   */
  public async groomUpdate(item: any): Promise<any> {
    return item;
  }

  // noinspection JSMethodCanBeStatic
  /**
   * Tidy up item for output
   * @return {any} tidied item
   */
  public groomReadResponse(_: IRouterContext, item: any): any {
    return item;
  }

  /**
   * Read a single item
   */
  public async readOne(ctx: IRouterContext): Promise<void> {
    await Readable.readOne(this, this.model, ctx);
  }

  /**
   * List items
   */
  public async readMany(ctx: IRouterContext): Promise<void> {
    await Readable.readMany(this, this.model, ctx);
  }

  /**
   * Create a new item. Response is `id` of item created
   */
  public async createOne(ctx: IRouterContext): Promise<void> {
    await Writable.createOne(this, this.model, ctx);
  }

  //noinspection JSUnusedLocalSymbols
  /**
   * Called when an item has been created or restored
   */
  public async onCreated(_: TEntity) { // eslint-disable-line no-unused-vars
  }

  /**
   * Update an item. Response is `id` of item created
   */
  public async updateOne(ctx: IRouterContext): Promise<void> {
    await Writable.updateOne(this, this.model, ctx);
  }

  //noinspection JSUnusedLocalSymbols
  /**
   * Called when an item has been updated
   */
  public async onUpdated(_: TEntity) { // eslint-disable-line no-unused-vars
  }

  /**
   * Delete a item. Response is success or failure
   */
  public async deleteOne(ctx: IRouterContext): Promise<void> {
    await Deletable.deleteOne(this, this.model, ctx);
  }

  //noinspection JSUnusedLocalSymbols
  /**
   * Called when an item has been deleted
   */
  public async onDeleted(_: string) { // eslint-disable-line no-unused-vars
  }

  /**
   * Restore a soft deleted item. Response is success or failure
   */
  public async restoreOne(ctx: IRouterContext): Promise<void> {
    await Deletable.restoreOne(this, this.model, ctx);
  }
}
