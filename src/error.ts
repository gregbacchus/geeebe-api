import { Statuses } from '@geeebe/common';
import { logger, Logger, WithLogger } from '@geeebe/logging';
import { Context } from 'koa';

const debug = logger.child({});

const EXIT_ERROR = 1;

const getErrorStatus = (err: Error): number | undefined => {
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' && status ? status : undefined;
};

const getStringProperty = (err: unknown, property: string): string | undefined => {
  const record = err as Record<string, unknown>;
  const value = record[property];
  return typeof value === 'string' && value ? value : undefined;
};

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
export const formatError = (ctx: Context & Partial<WithLogger>, err: unknown): void => {
  const log = ctx.logger || debug;

  if (!(err instanceof Error)) {
    log(`${ctx.request.method} ${ctx.request.url}`, { error: err });
    ctx.set('Cache-Control', 'max-age=0');
    ctx.set('Pragma', 'no-cache');
    ctx.status = Statuses.SERVER_ERROR;
    return;
  }

  const data = { type: err.name, message: err.message };

  switch (err.name) {
    case 'UnauthorizedError':
      ctx.set('Cache-Control', 'max-age=0');
      ctx.set('Pragma', 'no-cache');
      ctx.status = getErrorStatus(err) ?? Statuses.UNAUTHORIZED;
      break;
    default:
      log(`${ctx.request.method} ${ctx.request.url}`, { error: err });
      ctx.set('Cache-Control', 'max-age=0');
      ctx.set('Pragma', 'no-cache');
      ctx.status = getErrorStatus(err) ?? Statuses.SERVER_ERROR;
      break;
  }
  ctx.body = { error: data };
};

/**
 * Handle Koa app errors
 */
export const onError = (port: number | string, log: Logger) => (error: Error): void | never => {
  log.error(error);
  if (getStringProperty(error, 'syscall') !== 'listen') {
    return;
  }

  const bind = typeof port === 'string'
    ? `Pipe ${port}`
    : `Port ${port}`;

  // handle specific listen errors with friendly messages
  switch (getStringProperty(error, 'code')) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(EXIT_ERROR); // eslint-disable-line no-process-exit
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(EXIT_ERROR); // eslint-disable-line no-process-exit
    default:
      throw error;
  }
};