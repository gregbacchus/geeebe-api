import Koa = require('koa');
import { Server } from 'net';
import request = require('supertest');
import { AuthorizationDecoder } from '../src/authorization';

describe('AuthorizationDecoder', () => {
  describe('middleware()', () => {
    const decoder = new AuthorizationDecoder();
    const app = new Koa();
    app.use(decoder.middleware());
    app.use(async (ctx: any) => {
      // return decoded authorization as body so that the tests can check it
      ctx.body = ctx.authorization;
      ctx.status = 200;
    });

    let server: Server;

    beforeAll(() => {
      server = app.listen();
    });

    afterAll(() => {
      server.close();
    });

    it('must ignore no Authorization header', async () => {
      const response: any = await request(server)
        .post('/');
      expect(response.authorization).toBeUndefined();
    });

    it('must ignore malformed Authorization header', async () => {
      const response: any = await request(server)
        .post('/')
        .set('Authorization', 'TEST');
      expect(response.authorization).toBeUndefined();
    });

    it('must ignore malformed Authorization header Bearer token', async () => {
      const response: any = await request(server)
        .post('/')
        .set('Authorization', 'Bearer TOKEN');
      expect(response.authorization).toBeUndefined();
    });

    it('must ignore no Authorization header', async () => {
      const response: any = await request(server)
        .post('/')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.XbPfbIHMI6arZ3Y922BhjWgQzWXcXNrz0ogtVhfEd2o');
      const authorization = response.body;
      expect(authorization).toBeDefined();
      expect(authorization.sub).toBe('1234567890');
      expect(authorization.name).toBe('John Doe');
      expect(authorization.iat).toBe(1516239022);
    });
  });
});
