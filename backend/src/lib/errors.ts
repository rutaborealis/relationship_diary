import type { APIGatewayProxyResult } from 'aws-lambda';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const CORS_HEADERS: APIGatewayProxyResult['headers'] = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export function ok(body: unknown, statusCode = 200): APIGatewayProxyResult {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

export function formatError(err: unknown): APIGatewayProxyResult {
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const message = statusCode < 500 && err instanceof Error ? err.message : 'Internal server error';
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorHandling<T extends (event: any, context?: any) => Promise<APIGatewayProxyResult>>(handler: T): T {
  return (async (event: unknown, context: unknown) => {
    try {
      return await handler(event, context);
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      return formatError(err);
    }
  }) as T;
}
