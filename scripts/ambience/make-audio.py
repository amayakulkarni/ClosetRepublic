#!/usr/bin/env python3
"""Makes the built-in ambient loops for the Discord bot (bot/ambience/defaults/*.ogg).

Every sound is synthesised here from noise and sine waves, so the tracks are original work released
under CC0 (see bot/ambience/CREDITS.md). Each loop is exactly 60 seconds and every filter and reverb
works on the whole loop at once (circular), so the end joins the start without a click.

Needs: python3, numpy, ffmpeg (with libopus).   Run: python3 scripts/ambience/make-audio.py [out_dir]
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48_000
SECONDS = 60
N = SR * SECONDS
T = np.arange(N) / SR
FREQS = np.fft.rfftfreq(N, 1 / SR)


# ---------- building blocks (all circular, so loops join cleanly) ----------

def white(rng):
    return rng.standard_normal(N)


def shape(x, lo=None, hi=None, order=2, tilt=0.0):
    """Band-limit with smooth Butterworth-like edges; tilt=-1 gives pink, -2 brown noise."""
    spec = np.fft.rfft(x)
    gain = np.ones_like(FREQS)
    f = np.maximum(FREQS, 1e-3)
    if lo:
        gain *= 1 / np.sqrt(1 + (lo / f) ** (2 * order))
    if hi:
        gain *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    if tilt:
        gain *= (np.maximum(FREQS, 20.0) / 1000.0) ** (tilt / 2)
    spec *= gain
    spec[0] = 0
    return np.fft.irfft(spec, N)


def lfo(cycles, phase=0.0):
    """A slow sine with a whole number of cycles per loop, 0..1."""
    return 0.5 + 0.5 * np.sin(2 * np.pi * cycles * T / SECONDS + phase)


def put(buf, sig, at):
    """Adds `sig` starting at sample `at`, wrapping around the end of the loop."""
    at = int(at) % N
    end = at + len(sig)
    if end <= N:
        buf[at:end] += sig
    else:
        cut = N - at
        buf[at:] += sig[:cut]
        buf[: end - N] += sig[cut:]


def mix(*sigs):
    """Adds arrays of different lengths, padding the short ones with silence."""
    out = np.zeros(max(len(x) for x in sigs))
    for x in sigs:
        out[: len(x)] += x
    return out


def decay_tone(freq, tau, length=None, phase=0.0):
    length = length or int(tau * 8 * SR)
    t = np.arange(length) / SR
    return np.sin(2 * np.pi * freq * t + phase) * np.exp(-t / tau)


def burst(rng, tau, length=None, bright=1.0):
    length = length or int(tau * 8 * SR)
    t = np.arange(length) / SR
    x = rng.standard_normal(length)
    x[1:] -= 0.6 * bright * x[:-1] if bright > 0 else 0  # tilt toward the highs
    return x * np.exp(-t / tau)


def reverb(x, rt60, wet=0.4, predelay=0.02, damp=4500.0, seed=7):
    """Circular convolution with a synthetic room: the tail wraps round to the start of the loop."""
    rng = np.random.default_rng(seed)
    n_ir = int(min(N, rt60 * 1.3 * SR))
    t = np.arange(n_ir) / SR
    ir = rng.standard_normal(n_ir) * np.exp(-6.9 * t / rt60)
    ir = np.concatenate([np.zeros(int(predelay * SR)), ir])[:n_ir]
    spec = np.fft.rfft(ir, N)
    spec *= 1 / np.sqrt(1 + (np.maximum(FREQS, 1) / damp) ** 4)
    ir = np.fft.irfft(spec, N)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-12
    out = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir), N)
    return (1 - wet) * x + wet * out * (np.std(x) / (np.std(out) + 1e-12))


def pan(sig, p):
    """Equal-power pan, p from -1 (left) to 1 (right). Returns (left, right)."""
    a = (p + 1) * np.pi / 4
    return sig * np.cos(a), sig * np.sin(a)


def finish(left, right, rms_db=-22.0, peak_db=-1.5):
    st = np.stack([left, right], axis=1)
    st -= st.mean(axis=0)
    st *= 10 ** (rms_db / 20) / (np.sqrt(np.mean(st ** 2)) + 1e-12)
    peak = np.max(np.abs(st))
    limit = 10 ** (peak_db / 20)
    if peak > limit:  # soft clip rather than hard clip
        st = limit * np.tanh(st / limit)
    return st


# ---------- voices (cafe and town hall chatter) ----------

VOWELS = [(730, 1090), (270, 2290), (300, 870), (530, 1840), (570, 840), (440, 1020), (660, 1720), (390, 1990)]


def babble(rng, voices, talk_share, bright=1.0):
    """Murmur of several people talking: pitched, formant-shaped syllables with pauses between phrases."""
    left = np.zeros(N)
    right = np.zeros(N)
    for v in range(voices):
        f0 = rng.uniform(95, 250)
        track = np.zeros(N)
        t = rng.uniform(0, 3)
        while t < SECONDS:
            if rng.random() < talk_share:
                for _ in range(rng.integers(3, 9)):  # one phrase of syllables
                    dur = rng.uniform(0.12, 0.32)
                    n = int(dur * SR)
                    tt = np.arange(n) / SR
                    f1, f2 = VOWELS[rng.integers(len(VOWELS))]
                    f1 *= rng.uniform(0.9, 1.1)
                    f2 *= rng.uniform(0.9, 1.1)
                    pitch = f0 * (1 + 0.08 * np.sin(2 * np.pi * rng.uniform(4, 6) * tt) + rng.uniform(-0.12, 0.12) * tt / dur)
                    phase = 2 * np.pi * np.cumsum(pitch) / SR
                    syl = np.zeros(n)
                    for h in range(1, 14):
                        fh = f0 * h
                        amp = np.exp(-((fh - f1) / 180) ** 2) + 0.7 * np.exp(-((fh - f2) / 260) ** 2) + 0.05 / h
                        syl += amp * np.sin(h * phase)
                    syl += bright * 0.25 * rng.standard_normal(n) * (rng.random() < 0.3)  # an "s" now and then
                    syl *= np.hanning(n) ** 0.7
                    put(track, syl, (t * SR) % N)
                    t += dur + rng.uniform(0.0, 0.07)
            t += rng.uniform(0.8, 3.5)
        sig = shape(track, lo=120, hi=5500 if bright else 3000)
        sig /= np.std(sig) + 1e-9
        l, r = pan(sig, rng.uniform(-0.9, 0.9))
        left += l
        right += r
    return left, right


# ---------- the seven rooms ----------

def campfire():
    rng = np.random.default_rng(11)
    bed = shape(white(rng), hi=450, tilt=-2) * 3.0 * (0.75 + 0.25 * lfo(7, 1.0))
    hiss = shape(white(rng), lo=3000, hi=9000) * 0.05 * (0.6 + 0.4 * lfo(11, 2.0))
    left = bed + hiss
    right = shape(white(np.random.default_rng(12)), hi=450, tilt=-2) * 3.0 * (0.75 + 0.25 * lfo(5, 0.2)) + hiss * 0.8
    for _ in range(int(14 * SECONDS)):  # crackles
        at = rng.uniform(0, N)
        tau = rng.uniform(0.0015, 0.012)
        sig = burst(rng, tau, bright=rng.uniform(0.3, 1.0)) * rng.lognormal(-1.0, 0.9)
        sig += decay_tone(rng.uniform(1500, 6000), tau * 1.5, len(sig)) * rng.uniform(0.2, 0.9)
        l, r = pan(sig, rng.uniform(-0.8, 0.8))
        put(left, l, at)
        put(right, r, at)
    for _ in range(int(0.5 * SECONDS)):  # logs shifting
        at = rng.uniform(0, N)
        sig = mix(decay_tone(rng.uniform(90, 200), 0.04) * rng.uniform(1.5, 3.5), burst(rng, 0.03, bright=0.2) * 0.8)
        l, r = pan(sig, rng.uniform(-0.5, 0.5))
        put(left, l, at)
        put(right, r, at)
    left, right = reverb(left, 0.5, 0.18, seed=1), reverb(right, 0.5, 0.18, seed=2)
    return finish(left, right, -21)


def hammock():
    """Beach: swells of surf in three bands that rise and break at slightly different moments."""
    out = []
    for side in range(2):
        rng = np.random.default_rng(21 + side)
        swell = lambda c, ph: np.clip(lfo(c, ph), 0, 1) ** 1.6
        base = 7 + side  # 7 and 8 waves a minute
        low = shape(white(rng), lo=60, hi=500, tilt=-1) * swell(base, 0.3 + side)
        mid = shape(white(rng), lo=400, hi=2800) * swell(base, 0.0 + side) * 0.5
        foam = shape(white(rng), lo=2500, hi=9500) * swell(base, -0.7 + side) ** 2.2 * 0.3
        rumble = shape(white(rng), hi=150, tilt=-2) * 6
        out.append(low * 2.2 + mid + foam + rumble * 0.4)
    left, right = out
    # a few distant gulls would be easy to overdo; a soft wind bed sits under the waves instead
    wind = shape(white(np.random.default_rng(29)), lo=200, hi=1200) * (0.1 + 0.15 * lfo(3, 1)) * 0.5
    return finish(reverb(left + wind, 1.2, 0.2, seed=3), reverb(right + wind * 0.8, 1.2, 0.2, seed=4), -22)


def dictators_bedroom():
    """A heavy clock: tick and a lower tock every half second, in a quiet room."""
    rng = np.random.default_rng(31)
    left = np.zeros(N)
    right = np.zeros(N)
    for i in range(SECONDS * 2):
        tock = i % 2
        f1, f2, f3 = (1650, 2400, 150) if tock else (2300, 3300, 190)
        sig = mix(decay_tone(f1, 0.006) * 1.0, decay_tone(f2, 0.003) * 0.7, decay_tone(f3, 0.02) * 1.6, burst(rng, 0.0012, bright=1.0) * 1.2)
        sig *= 0.9 if tock else 1.0
        l, r = pan(sig, -0.25)
        put(left, l, i * SR / 2)
        put(right, r, i * SR / 2)
    tone = shape(white(rng), hi=300, tilt=-2) * 0.08
    left, right = reverb(left, 0.9, 0.3, damp=3500, seed=5) + tone, reverb(right, 0.9, 0.3, damp=3500, seed=6) + tone
    return finish(left, right, -26, -3)


def jantar_mantar():
    """Busy road: a steady hum, vehicles sweeping past and the odd horn."""
    rng = np.random.default_rng(41)
    hum = shape(white(rng), lo=70, hi=1800, tilt=-1) * (0.7 + 0.3 * lfo(6, 0.5))
    left = hum * 1.0
    right = shape(white(np.random.default_rng(42)), lo=70, hi=1800, tilt=-1) * (0.7 + 0.3 * lfo(5, 2.0))
    for _ in range(11):  # vehicles
        dur = rng.uniform(4.5, 10)
        n = int(dur * SR)
        env = np.hanning(n) ** 1.4
        body = shape_len(rng.standard_normal(n), 200, rng.uniform(900, 2200)) * 1.6
        engine = np.sin(2 * np.pi * rng.uniform(48, 95) * np.arange(n) / SR + 3 * np.sin(2 * np.pi * rng.uniform(1, 3) * np.arange(n) / SR)) * 0.25
        sig = (body + engine) * env
        p = np.linspace(-0.9, 0.9, n) * rng.choice([-1, 1])
        a = (p + 1) * np.pi / 4
        at = rng.uniform(0, N)
        put(left, sig * np.cos(a), at)
        put(right, sig * np.sin(a), at)
    for _ in range(12):  # horns, often in twos
        base = rng.uniform(330, 680)
        for k in range(rng.choice([1, 1, 2, 3])):
            dur = rng.uniform(0.18, 0.55)
            n = int(dur * SR)
            tt = np.arange(n) / SR
            env = np.minimum(tt / 0.02, 1) * np.minimum((dur - tt) / 0.04, 1)
            horn = sum(np.sin(2 * np.pi * base * m * tt) / m for m in (1, 2, 3, 4)) + 0.9 * sum(np.sin(2 * np.pi * base * 1.26 * m * tt) / m for m in (1, 2, 3))
            horn = horn * env * 0.5
            l, r = pan(horn, rng.uniform(-0.9, 0.9))
            at = rng.uniform(0, N)
            put(left, l, at + k * (dur + 0.12) * SR)
            put(right, r, at + k * (dur + 0.12) * SR)
    return finish(reverb(left, 0.4, 0.15, seed=8), reverb(right, 0.4, 0.15, seed=9), -19, -2)


def shape_len(x, lo, hi):
    """shape() for a short array (no loop): FFT band-pass on that array."""
    spec = np.fft.rfft(x)
    f = np.maximum(np.fft.rfftfreq(len(x), 1 / SR), 1e-3)
    spec *= 1 / np.sqrt(1 + (lo / f) ** 4) / np.sqrt(1 + (f / hi) ** 4)
    out = np.fft.irfft(spec, len(x))
    return out / (np.std(out) + 1e-9)


def cafe():
    """Quiet chatter, cups on saucers and the odd hiss of a coffee machine."""
    rng = np.random.default_rng(51)
    left, right = babble(rng, 7, 0.45)
    left *= 0.55
    right *= 0.55
    for _ in range(int(0.45 * SECONDS)):  # ceramic
        f = rng.choice([3100, 3800, 4700, 5600])
        sig = mix(decay_tone(f, 0.05), 0.6 * decay_tone(f * 1.51, 0.03)) * rng.uniform(0.15, 0.6)
        l, r = pan(sig, rng.uniform(-0.8, 0.8))
        at = rng.uniform(0, N)
        put(left, l, at)
        put(right, r, at)
    for _ in range(3):  # steam
        dur = rng.uniform(2.0, 3.5)
        n = int(dur * SR)
        env = np.hanning(n) ** 0.6
        sig = shape_len(rng.standard_normal(n), 2500, 9000) * env * 0.4
        l, r = pan(sig, rng.uniform(-0.6, 0.6))
        at = rng.uniform(0, N)
        put(left, l, at)
        put(right, r, at)
    room = shape(white(rng), hi=600, tilt=-1) * 0.12
    return finish(reverb(left + room, 0.7, 0.28, seed=10), reverb(right + room, 0.7, 0.28, seed=11), -24)


def town_hall():
    """A big stone hall: distant crowd, soft footsteps and a very long reverb tail."""
    rng = np.random.default_rng(61)
    left, right = babble(rng, 12, 0.5, bright=0.5)
    for _ in range(int(0.7 * SECONDS)):  # footsteps and chair scrapes far away
        sig = mix(decay_tone(rng.uniform(70, 160), 0.03) * 1.2, burst(rng, 0.01, bright=0.2) * 0.6)
        l, r = pan(sig, rng.uniform(-0.9, 0.9))
        at = rng.uniform(0, N)
        put(left, l, at)
        put(right, r, at)
    hall = shape(white(rng), hi=250, tilt=-2) * 0.9
    left, right = left * 0.35 + hall, right * 0.35 + hall * 0.9
    return finish(reverb(left, 4.2, 0.78, predelay=0.07, damp=3000, seed=12), reverb(right, 4.2, 0.78, predelay=0.09, damp=3000, seed=13), -24)


def dark_alley():
    """Low drones, a thin cold tone, wind and metal that clangs far away."""
    rng = np.random.default_rng(71)
    left = np.zeros(N)
    right = np.zeros(N)
    for f, g, c in [(41.2, 1.0, 2), (55.0, 0.8, 3), (58.27, 0.7, 5), (82.41, 0.4, 4), (110.0, 0.25, 7), (116.54, 0.2, 6)]:
        for side, arr in ((0, left), (1, right)):
            drift = 0.6 * np.sin(2 * np.pi * (c + side) * T / SECONDS + rng.uniform(0, 6))
            ph = 2 * np.pi * f * T + drift * 2
            arr += g * np.sin(ph) * (0.6 + 0.4 * lfo(c + side, rng.uniform(0, 6))) + g * 0.3 * np.sin(2 * ph)
    for f, c in ((1396.9, 9), (1975.5, 13)):  # a thin tritone that comes and goes
        sig = np.sin(2 * np.pi * f * T) * lfo(c, rng.uniform(0, 6)) ** 4 * 0.035
        left += sig
        right += sig[::-1] * 0 + np.roll(sig, 4800)
    wind = shape(white(rng), lo=250, hi=900, order=3) * lfo(2, 0.5) ** 2 * 1.4
    left += wind
    right += np.roll(wind, SR)
    for _ in range(7):  # distant metal
        base = rng.uniform(380, 700)
        sig = mix(*[decay_tone(base * r, 0.35 / (i + 1)) * a for i, (r, a) in enumerate([(1, 1.0), (2.76, 0.6), (5.4, 0.3), (8.93, 0.15)])]) * rng.uniform(0.5, 1.2)
        l, r = pan(sig, rng.uniform(-0.9, 0.9))
        at = rng.uniform(0, N)
        put(left, l, at)
        put(right, r, at)
    for at in (9, 31, 47):  # sub boom
        sig = decay_tone(44, 0.9) * 2.5
        put(left, sig, at * SR)
        put(right, sig, at * SR)
    return finish(reverb(left, 5.0, 0.55, damp=2500, seed=14), reverb(right, 5.0, 0.55, damp=2500, seed=15), -23)


TRACKS = {
    'town-hall': town_hall,
    'campfire': campfire,
    'hammock': hammock,
    'dictators-bedroom': dictators_bedroom,
    'jantar-mantar': jantar_mantar,
    'cafe': cafe,
    'dark-alley': dark_alley,
}


def write_wav(path, stereo):
    pcm = (np.clip(stereo, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'bot/ambience/defaults')
    out.mkdir(parents=True, exist_ok=True)
    for name, make in TRACKS.items():
        wav = out / f'{name}.wav'
        write_wav(wav, make())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', str(out / f'{name}.ogg')], check=True)
        wav.unlink()
        print(f'{name}.ogg', (out / f'{name}.ogg').stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
