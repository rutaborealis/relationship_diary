import { Resend } from 'resend';
import config from '../../config/app.config';
import { getParameter } from './ssm';

let resend: Resend | null = null;

async function getResend(): Promise<Resend> {
  if (!resend) {
    const apiKey = await getParameter('/diary/resend-api-key');
    resend = new Resend(apiKey);
  }
  return resend;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: EmailOptions): Promise<void> {
  if (config.ses.localMode) {
    console.log('\n📧 [LOCAL EMAIL]');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text ?? html.replace(/<[^>]+>/g, ''));
    console.log('---\n');
    return;
  }

  const client = await getResend();
  const { error } = await client.emails.send({
    from: `${config.ses.fromName} <${config.ses.fromAddress}>`,
    to,
    subject,
    html,
    text: text ?? html.replace(/<[^>]+>/g, ''),
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}
