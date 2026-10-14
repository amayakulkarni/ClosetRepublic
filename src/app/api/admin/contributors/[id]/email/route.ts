import { NextResponse } from 'next/server';
import { adminRoute, idFrom, readJson, textFrom } from '@/lib/admin-api';
import { getContributor } from '@/lib/contributors';
import { sendCustomEmail } from '@/lib/contributor-mail';
import { emailLog, mailConfigured } from '@/lib/mail';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/contributors/:id/email  the emails sent to and about this contributor. */
export const GET = adminRoute(async (_request: Request, ctx: Ctx) => {
  return NextResponse.json({ emails: emailLog(await idFrom(ctx)) });
});

/** POST /api/admin/contributors/:id/email  { subject, message }  sends them a message from the team. */
export const POST = adminRoute(async (request: Request, ctx: Ctx) => {
  if (!mailConfigured()) return NextResponse.json({ error: 'Email is not set up yet: add SMTP_HOST and MAIL_FROM to the server environment' }, { status: 503 });
  const contributor = getContributor(await idFrom(ctx));
  if (!contributor) return NextResponse.json({ error: 'No such contributor' }, { status: 404 });
  const body = await readJson(request);
  const subject = textFrom(body.subject, 'subject', { required: true, max: 200 })!;
  const message = textFrom(body.message, 'message', { required: true, max: 5000 })!;
  const email = await sendCustomEmail(contributor, subject, message);
  return NextResponse.json({ email }, { status: email.status === 'sent' ? 200 : 502 });
});
