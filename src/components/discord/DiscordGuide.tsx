import fs from 'node:fs';
import path from 'node:path';

// A beginner's guide to Discord on a phone, for people who have never used it. Screenshots are optional:
// a step shows public/discord-guide/<file> when it exists, or DISCORD_GUIDE_IMAGES_URL/<file> when that is set,
// and a labelled placeholder otherwise (see public/discord-guide/README.md for the file names).

type Step = { file: string; title: string; body: string[]; alt: string };

const STEPS: Step[] = [
  {
    file: '01-install.png',
    title: 'Install the Discord app',
    body: ['Open the App Store (iPhone) or Google Play (Android), search for "Discord" and tap Install.', 'The app is free. Use the official app only (publisher: Discord Inc.).'],
    alt: 'The Discord app page in the phone app store, with the Install button',
  },
  {
    file: '02-create-account.png',
    title: 'Create an account',
    body: [
      'Open the app and tap Register. Enter an email, a display name, a username and a password.',
      'A new username (not a real name) keeps the account separate from anything else online. Open the confirmation email from Discord and tap its link.',
    ],
    alt: 'The Create an account screen in the Discord app',
  },
  {
    file: '03-join-server.png',
    title: 'Join the Closet Republic server',
    body: ['Tap the invite link given on the website or by whoever invited the person. Tap Accept Invite, then Join.'],
    alt: 'The server invite screen with the Accept Invite button',
  },
  {
    file: '04-rules.png',
    title: 'Read the rules and answer the welcome questions',
    body: ['Discord shows the rules and a few questions when joining. Read the rules, tick the box to agree, and answer the questions. Only a few channels are open until the account is linked (next steps).'],
    alt: 'The rules screen and welcome questions inside the server',
  },
  {
    file: '05-menu.png',
    title: 'Find the channels',
    body: [
      'Tap the three-line menu icon at the top left to open the channel list. Channels are grouped in categories; tap a category name to fold or unfold it.',
      'A name that starts with # is a text channel. A name with a speaker icon is a voice channel.',
    ],
    alt: 'The channel list opened with the three-line menu icon, showing categories and channels',
  },
  {
    file: '06-link-page.png',
    title: 'Link the Discord account (two-step check)',
    body: [
      'Open closetrepublic.com/discord/link and tap Continue with Discord. This is step one: it proves which Discord account is being linked.',
      'Type the email used on Buy Me a Coffee (or on the crypto payment page), then type the 6-digit code that arrives by email. This is step two: it proves the email belongs to the person. The class role appears in Discord within a minute.',
    ],
    alt: 'The Continue with Discord button on the Closet Republic link page',
  },
  {
    file: '07-college.png',
    title: 'Pick hobby roles',
    body: ['Open #college (in Town Square), tap the menu that says "Pick your hobbies", select any number of hobbies and tap away to confirm. Each hobby opens its own channels. The picks can be changed at any time.'],
    alt: 'The #college channel with the hobby role menu open',
  },
  {
    file: '08-voice.png',
    title: 'Join a voice channel',
    body: [
      'Tap a voice channel, then Join Voice. Tap the microphone icon to mute or unmute, and the headphones icon to stop hearing others.',
      'Voice channels are public. Never say or show private or sensitive information in them, and do not trust newcomers with personal details.',
    ],
    alt: 'A voice channel with the Join Voice button and the mute and headphone icons',
  },
  {
    file: '09-privacy.png',
    title: 'Switch off direct messages from the server',
    body: [
      'Tap the server name at the top, then Privacy Settings (or Settings, then Privacy), and switch off Direct Messages. Then strangers in the server cannot message the account first.',
      'Any unsolicited direct message should be reported to the Embassy (next step), and not answered.',
    ],
    alt: 'The server menu with Privacy Settings and the Direct Messages switch turned off',
  },
  {
    file: '10-help.png',
    title: 'Ask for help',
    body: ['Open #open-a-ticket and tap Open a ticket (or type /ticket open). Only the person and the mods can see a ticket. Use it for questions, problems and reports.'],
    alt: 'The Open a ticket button in the open-a-ticket channel',
  },
];

function imageFor(file: string): string | null {
  const remote = (process.env.DISCORD_GUIDE_IMAGES_URL || '').replace(/\/+$/, '');
  if (remote) return `${remote}/${file}`;
  return fs.existsSync(path.join(process.cwd(), 'public', 'discord-guide', file)) ? `/discord-guide/${file}` : null;
}

export function DiscordGuide({ open }: { open: boolean }) {
  const body = (
    <ol className="discord-guide__steps">
      {STEPS.map((s, i) => {
        const src = imageFor(s.file);
        return (
          <li key={s.file} className="discord-guide__step">
            <h3>
              Step {i + 1}: {s.title}
            </h3>
            {s.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="discord-guide__shot" src={src} alt={s.alt} loading="lazy" width={360} />
            ) : (
              <div className="discord-guide__shot discord-guide__shot--empty" role="img" aria-label={`Screenshot to come: ${s.alt}`}>
                Screenshot to come: {s.alt}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
  return (
    <section className="section discord-guide" id="guide" aria-labelledby="guide-heading">
      {open ? (
        <>
          <h2 id="guide-heading">New to Discord? A step-by-step guide for phones</h2>
          {body}
        </>
      ) : (
        <details>
          <summary>
            <h2 id="guide-heading" style={{ display: 'inline' }}>
              New to Discord? Open the beginner guide
            </h2>
          </summary>
          {body}
        </details>
      )}
    </section>
  );
}
