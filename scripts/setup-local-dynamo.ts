import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import config from '../backend/config/app.config';

const client = new DynamoDBClient({
  region: config.aws.region,
  endpoint: 'http://localhost:8000',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

async function tableExists(name: string): Promise<boolean> {
  const res = await client.send(new ListTablesCommand({}));
  return (res.TableNames ?? []).includes(name);
}

async function createMainTable() {
  if (await tableExists(config.dynamo.mainTable)) {
    console.log(`✓ ${config.dynamo.mainTable} already exists`);
    return;
  }

  await client.send(new CreateTableCommand({
    TableName: config.dynamo.mainTable,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: config.dynamo.indexes.emailIndex,
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: {
          ProjectionType: 'INCLUDE',
          NonKeyAttributes: ['userId', 'name', 'gender', 'emailVerified', 'partnerId'],
        },
      },
    ],
  }));
  console.log(`✓ Created ${config.dynamo.mainTable}`);
}

async function createPushTable() {
  if (await tableExists(config.dynamo.pushTable)) {
    console.log(`✓ ${config.dynamo.pushTable} already exists`);
    return;
  }

  await client.send(new CreateTableCommand({
    TableName: config.dynamo.pushTable,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'reminder_time', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: config.dynamo.indexes.reminderTimeIndex,
        KeySchema: [
          { AttributeName: 'reminder_time', KeyType: 'HASH' },
          { AttributeName: 'userId', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  }));
  console.log(`✓ Created ${config.dynamo.pushTable}`);
}

async function main() {
  console.log('Setting up DynamoDB Local tables...');
  await createMainTable();
  await createPushTable();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
