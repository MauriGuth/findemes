import { type ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { HttpExceptionFilter } from './http-exception.filter.js';

function fakeHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', path: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('passes through Nest exceptions with a Spanish fallback message', () => {
    const { host, status, json } = fakeHost();
    filter.catch(new NotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'No encontramos lo que buscás.',
    });
  });

  it('replaces English messages Nest generates for string exceptions', () => {
    const { host, json } = fakeHost();
    filter.catch(new NotFoundException('Cannot GET /x'), host);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'No encontramos lo que buscás.',
      error: 'Not Found',
    });
  });

  it('keeps validation issues', () => {
    const { host, json } = fakeHost();
    filter.catch(
      new BadRequestException({ message: 'Datos inválidos', issues: [{ path: ['amount'] }] }),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'Datos inválidos',
      issues: [{ path: ['amount'] }],
    });
  });

  it('hides unknown errors behind a generic 500', () => {
    const { host, status, json } = fakeHost();
    filter.catch(new Error('secret db detail'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Algo salió mal. Probá de nuevo en un rato.',
    });
  });
});
