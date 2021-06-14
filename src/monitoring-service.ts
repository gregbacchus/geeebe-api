import { logger, Logger } from '@geeebe/logging';
import { Service } from '@geeebe/service';
import * as Router from '@koa/router';
import * as Koa from 'koa';
import { Server } from 'net';
import 'reflect-metadata';
import { onError } from './error';
import { errorMiddleware, livenessEndpoint, readinessEndpoint } from './middleware';
import { prometheusMetricsEndpoint } from './prometheus';

export interface MonitorServiceOptions {
  isAlive?: () => Promise<boolean>;
  isReady?: () => Promise<boolean>;
  logger?: Logger;
  port: number | string; // server port
}

export class MonitorService<TOptions extends MonitorServiceOptions = MonitorServiceOptions> extends Koa implements Service {
  protected readonly logger: Logger;

  private server: Server | undefined;

  /**
   * Create Koa app
   * @param options
   */
  constructor(protected readonly options: TOptions) {
    super();

    this.logger = this.options.logger || logger;
    this.use(errorMiddleware());

    this.on('error', onError(this.options.port, this.logger));
  }

  public start(): Promise<void> {
    if (this.server) throw new Error('Already started');

    const router = new Router();
    router.get('/alive', livenessEndpoint(this.options.isAlive));
    router.get('/metrics', prometheusMetricsEndpoint());
    router.get('/ready', readinessEndpoint(this.options.isReady));

    this.use(router.routes());
    this.use(router.allowedMethods());

    // start server
    return new Promise((resolve, reject) => {
      if (this.server) {
        reject(new Error('Already started'));
        return;
      }
      this.server = this.listen(this.options.port, () => {
        this.logger(`Monitoring started on http://localhost:${this.options.port}/`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }

  public dispose(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          return reject(err);
        }
        this.server = undefined;
        resolve();
      });
    });
  }
}