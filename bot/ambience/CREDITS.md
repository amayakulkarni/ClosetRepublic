# Ambience sources and licences

## Built-in loops (`defaults/*.ogg`)

All seven were generated from noise, filters and synthesised tones by `scripts/ambience/make-audio.py`. No recording or third-party sample is used. They are original and released as CC0 (public domain). Each is a 60-second seamless loop. They are placeholders: replace any of them by dropping a file into `data/ambience/` (below).

| Room | File | Source |
| --- | --- | --- |
| Town hall | town-hall.ogg | generated: reverberant murmur |
| Campfire | campfire.ogg | generated: fire bed with crackles |
| Hammock | hammock.ogg | generated: waves, wind, distant gulls |
| Dictator's bedroom | dictators-bedroom.ogg | generated: slow clock tick, low room tone |
| Jantar Mantar | jantar-mantar.ogg | generated: traffic, horns (played 6 dB louder) |
| Cafe | cafe.ogg | generated: chatter, cups, soft background |
| Dark alley | dark-alley.ogg | generated: drone, drips, distant sounds |

## Pictures (`visuals/*.gif`)

Pixel-art loops drawn by `scripts/ambience/make-visuals.py` (fire, beach, clock, coffee, cat). Original, CC0.

## Own tracks (Epidemic Sound or any other source)

Place files in `data/ambience/` on the server. The folder is outside git (`data` is ignored), so licensed audio is never published with the code.

- One file per room: `data/ambience/campfire.mp3`, or
- A folder per room: `data/ambience/campfire/` with several files (one is chosen at random each time the bot joins).

Room keys: `town-hall`, `campfire`, `hammock`, `dictators-bedroom`, `jantar-mantar`, `cafe`, `dark-alley`.

Before using Epidemic Sound tracks, check that the plan covers it. Playing a track on a loop in a Discord voice channel is a public performance of that track to every listener, and Epidemic's personal and commercial terms differ on what counts as allowed. If unsure, ask Epidemic support in writing and keep the answer. Record every file used below.

| Room | File | Source | Licence / plan | Date added |
| --- | --- | --- | --- | --- |
