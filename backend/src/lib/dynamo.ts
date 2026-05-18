import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  type QueryCommandInput,
  type ScanCommandInput,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import config from '../../config/app.config';

const clientConfig: ConstructorParameters<typeof DynamoDBClient>[0] = {
  region: config.aws.region,
};

if (config.dynamo.endpoint) {
  clientConfig.endpoint = config.dynamo.endpoint;
  clientConfig.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
}

const raw = new DynamoDBClient(clientConfig);
export const db = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true },
});

export const MAIN = config.dynamo.mainTable;
export const PUSH = config.dynamo.pushTable;

export async function getItem(TableName: string, Key: Record<string, unknown>) {
  const res = await db.send(new GetCommand({ TableName, Key }));
  return res.Item ?? null;
}

export async function putItem(TableName: string, Item: Record<string, unknown>) {
  await db.send(new PutCommand({ TableName, Item }));
}

export async function updateItem(
  TableName: string,
  Key: Record<string, unknown>,
  updates: Record<string, unknown>,
) {
  const expr: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(updates)) {
    expr.push(`#${k} = :${k}`);
    names[`#${k}`] = k;
    values[`:${k}`] = v;
  }

  await db.send(new UpdateCommand({
    TableName,
    Key,
    UpdateExpression: `SET ${expr.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

export async function deleteItem(TableName: string, Key: Record<string, unknown>) {
  await db.send(new DeleteCommand({ TableName, Key }));
}

export async function query(TableName: string, params: Omit<QueryCommandInput, 'TableName'>) {
  const res = await db.send(new QueryCommand({ TableName, ...params }));
  return res.Items ?? [];
}

export async function scan(TableName: string, params: Omit<ScanCommandInput, 'TableName'> = {}) {
  const res = await db.send(new ScanCommand({ TableName, ...params }));
  return res.Items ?? [];
}

export async function transactWrite(items: TransactWriteCommandInput['TransactItems']) {
  await db.send(new TransactWriteCommand({ TransactItems: items }));
}
