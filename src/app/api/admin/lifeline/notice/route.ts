import { NextResponse } from 'next/server';
import { adminRoute, linkFrom, readJson, textFrom } from '@/lib/admin-api';
import { sendNoticeTest, startBroadcast, type Notice } from '@/lib/lifeline';
import { mailConfigured } from '@/lib/mail';

/**
 * POST /api/admin/lifeline/notice  { subject, message, siteUrl?, githubUrl?, donateUrl?, resources?, test?: boolean }
 * test: true sends one copy to CONTRIBUTIONS_EMAIL; otherwise it emails every subscriber.
 */
export const POST = adminRoute(async (request: Request) => {
  if (!mailConfigured()) return NextResponse.json({ error: 'Email is not set up yet: add SMTP_HOST and MAIL_FROM to the server environment' }, { status: 503 });
  const body = await readJson(request);
  const notice: Notice = {
    subject: textFrom(body.subject, 'subject', { required: true, max: 200 })!,
    message: textFrom(body.message, 'message', { required: true, max: 5000 })!,
    siteUrl: linkFrom(body.siteUrl, 'new site link'),
    githubUrl: linkFrom(body.githubUrl, 'GitHub link'),
    donateUrl: linkFrom(body.donateUrl, 'donation link'),
    resources: textFrom(body.resources, 'other resources', { max: 3000 }),
  };
  if (body.test === true) {
    const email = await sendNoticeTest(notice);
    return NextResponse.json({ email }, { status: email.status === 'sent' ? 200 : 502 });
  }
  return NextResponse.json({ broadcast: startBroadcast(notice) }, { status: 202 });
});
