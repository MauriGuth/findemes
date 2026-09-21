import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string;
  error?: string;
  issues?: unknown;
}

const GENERIC_MESSAGES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Revisá los datos que mandaste.',
  [HttpStatus.UNAUTHORIZED]: 'Tenés que iniciar sesión.',
  [HttpStatus.FORBIDDEN]: 'No tenés permiso para hacer esto.',
  [HttpStatus.NOT_FOUND]: 'No encontramos lo que buscás.',
  [HttpStatus.CONFLICT]: 'Eso ya existe.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Demasiados intentos. Esperá un momento y probá de nuevo.',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Algo salió mal. Probá de nuevo en un rato.',
};

/**
 * Turns every error into `{ statusCode, message, error?, issues? }` with a
 * message in Spanish the app can show as is. Logs never include request
 * bodies, amounts or personal data: method, path, status and the error name.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception);
    const route = `${request.method} ${request.path}`;

    if (body.statusCode >= 500) {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`${route} -> ${String(body.statusCode)} ${error.name}`, error.stack);
    } else {
      this.logger.warn(`${route} -> ${String(body.statusCode)}`);
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw = exception.getResponse();
      const generic = GENERIC_MESSAGES[statusCode] ?? exception.message;

      if (typeof raw === 'string') {
        return { statusCode, message: raw || generic };
      }
      const record = raw as Record<string, unknown>;
      // Nest builds `{ statusCode, message, error? }` itself for `new XException()` and
      // `new XException('text')`: those messages are English ("Cannot GET /x"), so the
      // Spanish generic wins. An object body (`new XException({ message, issues })`)
      // is ours and carries a message written for the user.
      const nestGenerated = 'statusCode' in record;
      const message =
        !nestGenerated && typeof record['message'] === 'string' ? record['message'] : generic;
      const issues =
        record['issues'] ?? (Array.isArray(record['message']) ? record['message'] : undefined);
      const error = typeof record['error'] === 'string' ? record['error'] : undefined;
      return { statusCode, message, ...(error ? { error } : {}), ...(issues ? { issues } : {}) };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: GENERIC_MESSAGES[HttpStatus.INTERNAL_SERVER_ERROR] ?? 'Error interno',
    };
  }
}
