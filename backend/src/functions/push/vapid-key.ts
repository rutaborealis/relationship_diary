import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getParameter } from '../../lib/ssm';
import { ok, withErrorHandling } from '../../lib/errors';
import config from '../../../config/app.config';

const handler = withErrorHandling(async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const key = await getParameter(config.vapid.ssmParamPublicKey);
  return ok({ key });
});

export { handler };
