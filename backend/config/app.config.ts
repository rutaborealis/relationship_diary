const stage = process.env.STAGE || 'dev';
const isLocal = Boolean(process.env.DYNAMO_ENDPOINT);

const config = {
  aws: {
    region: process.env.AWS_REGION || 'eu-central-1',
  },

  dynamo: {
    mainTable:  process.env.TABLE_NAME      || `DiaryMain-${stage}`,
    pushTable:  process.env.PUSH_TABLE_NAME || `DiaryPush-${stage}`,
    // When DYNAMO_ENDPOINT is set, connects to DynamoDB Local
    endpoint:   process.env.DYNAMO_ENDPOINT as string | undefined,
    indexes: {
      emailIndex:        'EmailIndex',
      reminderTimeIndex: 'ReminderTimeIndex',
    },
  },

  jwt: {
    ssmParamSecret:  '/diary/jwt-secret',
    // localSecret is used in local dev to skip SSM
    localSecret:     process.env.JWT_SECRET as string | undefined,
    accessExpiresIn: '7d' as const,
    issuer:          'relationship-diary',
  },

  ses: {
    fromAddress: process.env.SES_FROM_ADDRESS || 'onboarding@resend.dev',
    fromName:    'Relationship Diary',
    localMode:   isLocal,
  },

  vapid: {
    ssmParamPublicKey:  '/diary/vapid-public-key',
    ssmParamPrivateKey: '/diary/vapid-private-key',
    ssmParamEmail:      '/diary/vapid-email',
  },

  auth: {
    verificationCodeLength: 6,
    verificationCodeTtlMin: 15,
    inviteTokenTtlHours:    72,
    bcryptSaltRounds:       12,
  },

  app: {
    domain: process.env.APP_DOMAIN || 'https://yourdomain.com',
    stage,
  },
};

export type AppConfig = typeof config;
export default config;
