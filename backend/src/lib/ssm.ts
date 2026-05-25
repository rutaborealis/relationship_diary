import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import config from '../../config/app.config';

const client = new SSMClient({ region: config.aws.region });
const cache: Record<string, string> = {};

export async function getParameter(name: string, withDecryption = true): Promise<string> {
  if (cache[name]) return cache[name];

  // In local dev, resolve secrets from env vars instead of SSM
  if (process.env.DYNAMO_ENDPOINT) {
    const envMap: Record<string, string | undefined> = {
      '/diary/jwt-secret':        process.env.JWT_SECRET,
      '/diary/vapid-public-key':  process.env.VAPID_PUBLIC_KEY,
      '/diary/vapid-private-key': process.env.VAPID_PRIVATE_KEY,
      '/diary/vapid-email':       process.env.VAPID_EMAIL,
      '/diary/resend-api-key':    process.env.RESEND_API_KEY,
    };
    if (envMap[name]) {
      cache[name] = envMap[name]!;
      return cache[name];
    }
  }

  const res = await client.send(new GetParameterCommand({ Name: name, WithDecryption: withDecryption }));
  cache[name] = res.Parameter!.Value!;
  return cache[name];
}
