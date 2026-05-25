/**
 * Local development server — runs Lambda handlers as Express routes.
 * Emails are printed to console, DynamoDB Local is used as database.
 *
 * Usage:
 *   docker compose up -d
 *   npm run setup-local-dynamo
 *   npm run local
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Auth
import { handler as register }    from '../backend/src/functions/auth/register';
import { handler as verifyEmail }  from '../backend/src/functions/auth/verify-email';
import { handler as login }        from '../backend/src/functions/auth/login';
import { handler as me }           from '../backend/src/functions/auth/me';

// Users & Partners
import { handler as usersSearch }    from '../backend/src/functions/users/search';
import { handler as partnerInvite }  from '../backend/src/functions/partners/invite';
import { handler as partnerAccept }  from '../backend/src/functions/partners/accept';
import { handler as partnerPending } from '../backend/src/functions/partners/pending';

// Entries
import { handler as entriesGet }     from '../backend/src/functions/entries/get';
import { handler as entriesSave }    from '../backend/src/functions/entries/save';
import { handler as calendar }       from '../backend/src/functions/entries/calendar';

// Qualities
import { handler as qualitiesList }   from '../backend/src/functions/qualities/list';
import { handler as qualitiesCreate } from '../backend/src/functions/qualities/create';
import { handler as qualitiesUpdate } from '../backend/src/functions/qualities/update';
import { handler as qualitiesRemove } from '../backend/src/functions/qualities/remove';

// Push
import { handler as vapidKey }       from '../backend/src/functions/push/vapid-key';
import { handler as subscribe }      from '../backend/src/functions/push/subscribe';
import { handler as reminder }       from '../backend/src/functions/push/reminder';
import { handler as notifyPartner }  from '../backend/src/functions/push/notify-partner';
import { handler as pushSettings }   from '../backend/src/functions/push/settings';

const app = express();
app.use(cors());
app.use(express.json());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (event: any, context?: any) => Promise<APIGatewayProxyResult>;

function adapt(handler: AnyHandler) {
  return async (req: express.Request, res: express.Response) => {
    const event: Partial<APIGatewayProxyEvent> = {
      httpMethod:            req.method,
      path:                  req.path,
      headers:               req.headers as Record<string, string>,
      queryStringParameters: req.query as Record<string, string>,
      pathParameters:        req.params as Record<string, string>,
      body:                  req.method !== 'GET' ? JSON.stringify(req.body) : null,
    };

    const result = await handler(event);
    res
      .status(result.statusCode)
      .set((result.headers ?? {}) as Record<string, string>)
      .send(result.body);
  };
}

// Auth
app.post('/api/auth/register',     adapt(register));
app.post('/api/auth/verify-email', adapt(verifyEmail));
app.post('/api/auth/login',        adapt(login));
app.get('/api/auth/me',            adapt(me));

// Users & Partners
app.get('/api/users/search',       adapt(usersSearch));
app.post('/api/partner/invite',    adapt(partnerInvite));
app.post('/api/partner/accept',    adapt(partnerAccept));
app.get('/api/partner/pending',    adapt(partnerPending));

// Entries
app.get('/api/entries',            adapt(entriesGet));
app.post('/api/entries',           adapt(entriesSave));
app.get('/api/calendar',           adapt(calendar));

// Qualities
app.get('/api/qualities',          adapt(qualitiesList));
app.post('/api/qualities',         adapt(qualitiesCreate));
app.patch('/api/qualities/:id',    adapt(qualitiesUpdate));
app.delete('/api/qualities/:id',   adapt(qualitiesRemove));

// Push
app.get('/api/push-settings',      adapt(pushSettings));
app.get('/api/vapid-public-key',   adapt(vapidKey));
app.post('/api/subscribe',         adapt(subscribe));
app.post('/api/reminder',          adapt(reminder));
app.post('/api/notify-partner',    adapt(notifyPartner));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);
  console.log('DynamoDB Local endpoint:', process.env.DYNAMO_ENDPOINT || 'http://localhost:8000');
});
