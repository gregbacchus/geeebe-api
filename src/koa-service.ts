import { logger, Logger } from '@geeebe/logging';
import { Service } from '@geeebe/service';
import * as Router from '@koa/router';
import * as Koa from 'koa';
import { DefaultContext, DefaultState } from 'koa';
import * as helmet from 'koa-helmet';
import { Server } from 'net';
import { collectDefaultMetrics } from 'prom-client';
import 'reflect-metadata';
import { validate } from 'validata-koa';
import { onError } from './error';
import { DEFAULT_HELMET_OPTIONS, HelmetOptions } from './helmet';
import { errorMiddleware, Monitor, observeMiddleware } from './middleware';

import bodyParser = require('koa-bodyparser');
import compress = require('koa-compress');
import conditional = require('koa-conditional-get');
import etag = require('koa-etag');
import serveStatic = require('koa-static');

const DEFAULT_OPTIONS = {
  helmetOptions: DEFAULT_HELMET_OPTIONS,
  observe: true,
  port: 80,
  serviceName: 'service',
};

if (process.env.JEST_WORKER_ID === undefined) {
  collectDefaultMetrics();
}

export interface ServiceOptions {
  helmetOptions?: HelmetOptions;
  isAlive?: () => Promise<boolean>;
  isReady?: () => Promise<boolean>;
  logger?: Logger;
  loggerIgnorePath?: RegExp;
  monitor?: Monitor;
  observe?: boolean;
  port: number | string; // server port
  serviceName?: string; // name of service, used for tracing
  staticPath?: string; // directory from which to serve static files
  useLogger?: boolean; // include koa logger
}

// noinspection JSUnusedGlobalSymbols
export abstract class KoaService<TOptions extends ServiceOptions = ServiceOptions, StateT extends DefaultState = DefaultState, CustomT extends DefaultContext = DefaultContext> extends Koa<StateT, CustomT> implements Service {
  protected readonly options: TOptions;

  protected readonly logger: Logger;

  private server: Server | undefined;

  /**
   * Create Koa app
   * @param options
   */
  constructor(options: TOptions) {
    super();

    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.logger = this.options.logger || logger;

    if (this.options.observe) {
      this.use(observeMiddleware(this.logger, this.options));
    }
    this.use(errorMiddleware());
    this.use(validate());
    if (this.options.helmetOptions) {
      this.use(helmet(this.options.helmetOptions));
    }
    this.use(conditional());
    this.use(etag());
    this.use(compress());
    if (this.options.staticPath) {
      this.logger(`Serving static content from ${this.options.staticPath}`);
      this.use(serveStatic(this.options.staticPath));
    }
    this.use(bodyParser());

    this.on('error', onError(this.options.port, this.logger));
  }

  /**
   * Start the app
   */
  public start(): Promise<void> {
    const router = new Router();
    this.mountApi(router);

    this.use(router.routes());
    this.use(router.allowedMethods());

    // start server
    return this.startServer();
  }

  public stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        this.server = undefined;
        resolve();
      });
    });
  }

  public dispose(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Start the web server
   */
  private startServer = (): Promise<void> => new Promise<void>((resolve, reject) => {
    if (this.server) {
      reject(new Error('Already started'));
      return;
    }
    this.server = this.listen(this.options.port, () => {
      this.logger(`HTTP started on http://localhost:${this.options.port}/`);
      resolve();
    });
  })

  /**
   * Override to mount API routes
   */
  protected abstract mountApi(router: Router): void;
}
