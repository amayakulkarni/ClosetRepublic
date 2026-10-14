import 'server-only';
import { AREA_LABEL } from './contribution-areas';
import { communityLinks } from './community';
import type { Contributor } from './contributors';
import { CONTRIBUTIONS_EMAIL, MAIL_REPLY_TO, htmlFrom, sendMail, type MailResult } from './mail';
import { SITE_URL } from './site-url';

// The emails around a contributor sign-up:
//  - an alert to the team (CONTRIBUTIONS_EMAIL) for every new sign-up
//  - a confirmation to the contributor that repeats the ground rules
//  - a message when an admin marks them verified or declined
//  - any custom message an admin writes on the Contributors tab

const area = (c: Contributor) => AREA_LABEL[c.area].plain.toLowerCase();
const greeting = (c: Contributor) => `Hi ${c.name},`;
const signOff = 'With love,\nCloset Republic';

function communityText() {
  return communityLinks()
    .map((l) => `- ${l.name}: ${l.url ?? 'link coming soon'}`)
    .join('\n');
}

function mail(c: Contributor, kind: string, subject: string, text: string) {
  return sendMail({ to: c.email, subject, text, html: htmlFrom(text), replyTo: MAIL_REPLY_TO, kind, contributorId: c.id });
}

/** Alert to the team plus confirmation to the contributor. Runs after the sign-up is saved. */
export async function sendSignupEmails(c: Contributor) {
  const work = c.area === 'art' ? 'artwork' : 'writing';
  const results: Promise<MailResult>[] = [
    mail(
      c,
      'confirmation',
      `We got your ${area(c)} sign-up`,
      `${greeting(c)}

Thank you for offering to help with the ${area(c)} of Closet Republic. We have your details and this public link:
${c.portfolioUrl}

What happens next:
- We check that the ${work} at your link is yours, or that you commissioned it. We may contact you on that platform to confirm.
- Once it is verified we will email you here.

A few things to keep in mind:
- Please do not send private or unpublished ${work} by DM or email. Share only links to work that is already public.
- Have an idea? Share it in the public community so everyone can discuss it, not privately:
${communityText()}

If you did not sign up, you can ignore this email.

${signOff}`,
    ),
  ];
  if (CONTRIBUTIONS_EMAIL) {
    const text = `New ${area(c)} contributor on Closet Republic.

Name: ${c.name}
Pronouns: ${c.pronouns || 'not given'}
Email: ${c.email}
Portfolio: ${c.portfolioUrl}

Verify the link, then set their status on the Contributors tab:
${SITE_URL}/admin#contributors`;
    results.push(
      sendMail({ to: CONTRIBUTIONS_EMAIL, subject: `New ${area(c)} contributor: ${c.name}`, text, html: htmlFrom(text), replyTo: c.email, kind: 'admin-alert', contributorId: c.id }),
    );
  }
  return Promise.all(results);
}

/** Tells the contributor the outcome. Only verified and declined send anything. */
export function sendStatusEmail(c: Contributor): Promise<MailResult> | null {
  if (c.status === 'verified') {
    return mail(
      c,
      'verified',
      `You're verified as a Closet Republic ${area(c)} contributor`,
      `${greeting(c)}

Good news: we checked your link and you are now a verified ${area(c)} contributor for Closet Republic.

We will be in touch about what to work on. In the meantime, ideas and discussion happen in public:
${communityText()}

Welcome aboard, citizen.

${signOff}`,
    );
  }
  if (c.status === 'declined') {
    return mail(
      c,
      'declined',
      `About your ${area(c)} sign-up`,
      `${greeting(c)}

Thank you for offering to contribute to Closet Republic. We were not able to go ahead with your ${area(c)} sign-up this time. Often this is because we could not confirm that the work at the link is yours or was commissioned by you.

You are welcome to sign up again with a different public link, and to join the conversation in public:
${communityText()}

${signOff}`,
    );
  }
  return null;
}

/** A message an admin writes on the Contributors tab. */
export function sendCustomEmail(c: Contributor, subject: string, body: string) {
  return mail(c, 'message', subject, `${greeting(c)}\n\n${body.trim()}\n\n${signOff}`);
}
