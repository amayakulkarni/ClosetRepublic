"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_AVATAR,
  composeAvatarSvg,
  svgDataUrl,
  type AvatarChoice,
} from "@/lib/avatar";
import { AvatarBuilder } from "./AvatarBuilder";

const GENDERS = [
  "Woman",
  "Man",
  "Non-binary",
  "Trans woman",
  "Trans man",
  "Genderqueer",
  "Genderfluid",
  "Agender",
  "Two-spirit",
  "Hijra",
  "Questioning",
  "Prefer not to say",
];
const MARITAL = [
  "Single",
  "Married",
  "Civil partnership",
  "In a relationship",
  "Divorced",
  "Widowed",
  "It's complicated",
  "Prefer not to say",
];
const HAS_SPOUSE = new Set(["Married", "Civil partnership"]);

const AGREEMENT =
  "By generating a CR passport I agree to uphold the Constitution of CR and to live my life truthfully, without forcing a false identity on myself.";

type PhotoMode = "avatar" | "upload";

function suggestedMarker(gender: string): "F" | "M" | "X" {
  const g = gender.trim().toLowerCase();
  if (["woman", "female", "trans woman", "girl"].includes(g)) return "F";
  if (["man", "male", "trans man", "boy"].includes(g)) return "M";
  return "X";
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

async function canvasBytes(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg",
) {
  const blob = await new Promise<Blob | null>((r) =>
    canvas.toBlob(r, type, 0.92),
  );
  if (!blob) throw new Error("Could not encode image");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Passport photos are 35 × 45; crop the centre of the picture to that shape. */
async function photoFromFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 900;
    const target = canvas.width / canvas.height;
    const ratio = img.naturalWidth / img.naturalHeight;
    const sw = ratio > target ? img.naturalHeight * target : img.naturalWidth;
    const sh = ratio > target ? img.naturalHeight : img.naturalWidth / target;
    const g = canvas.getContext("2d")!;
    g.drawImage(
      img,
      (img.naturalWidth - sw) / 2,
      (img.naturalHeight - sh) / 2,
      sw,
      sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return {
      bytes: await canvasBytes(canvas, "image/jpeg"),
      type: "jpg" as const,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function photoFromAvatar(choice: AvatarChoice) {
  const img = await loadImage(svgDataUrl(await composeAvatarSvg(choice)));
  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = 900;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ececef";
  g.fillRect(0, 0, canvas.width, canvas.height);
  // Frame the head and shoulders like a passport photo (35:45) inside the 1136 × 1533 bust.
  const crop = { x: 128, y: 120, w: 880, h: 1131 };
  g.drawImage(
    img,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return {
    bytes: await canvasBytes(canvas, "image/png"),
    type: "png" as const,
  };
}

async function logoPng(color: string) {
  const svg = (await (await fetch("/brand/closet-white.svg")).text()).replace(
    'stroke="#fff"',
    `stroke="${color}"`,
  );
  const img = await loadImage(svgDataUrl(svg));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 640;
  canvas.getContext("2d")!.drawImage(img, 0, 0, 640, 640);
  return canvasBytes(canvas, "image/png");
}

export function PassportForm() {
  const [mode, setMode] = useState<PhotoMode>("avatar");
  const [avatar, setAvatar] = useState<AvatarChoice>(DEFAULT_AVATAR);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [gender, setGender] = useState("");
  const [marker, setMarker] = useState<"F" | "M" | "X">("X");
  const [markerTouched, setMarkerTouched] = useState(false);
  const [marital, setMarital] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(
    null,
  );
  const status = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!markerTouched) setMarker(suggestedMarker(gender));
  }, [gender, markerTouched]);

  useEffect(() => {
    if (!file) return setFilePreview(null);
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(
    () => () => void (result && URL.revokeObjectURL(result.url)),
    [result],
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (k: string) => String(form.get(k) ?? "").trim();
    setError(null);
    if (mode === "upload" && !file) {
      setError("Please choose a photo, or switch to building an avatar.");
      return;
    }
    setBusy(true);
    try {
      const [{ buildPassportPdf }, photo, logoWhite, logoBlack] =
        await Promise.all([
          import("@/lib/passport-pdf"),
          mode === "upload" && file
            ? photoFromFile(file)
            : photoFromAvatar(avatar),
          logoPng("#ffffff"),
          logoPng("#000000"),
        ]);
      const bytes = await buildPassportPdf({
        givenNames: get("givenNames"),
        surname: get("surname"),
        genderIdentity: gender.trim(),
        sexMarker: marker,
        pronouns: get("pronouns"),
        dateOfBirth: get("dob"),
        placeOfBirth: get("pob"),
        maritalStatus: marital,
        spouseName: HAS_SPOUSE.has(marital) ? get("spouse") : "",
        address: get("address"),
        photo,
        logoWhite,
        logoBlack,
      });
      const name = `closet-republic-passport-${
        get("surname")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-") || "citizen"
      }.pdf`;
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
      );
      setResult({ url, name });
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      requestAnimationFrame(() => status.current?.focus());
    } catch (err) {
      console.error(err);
      setError(
        "Something went wrong while printing your passport. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="passport-form" onSubmit={onSubmit}>
      <fieldset>
        <legend>1. Your photo</legend>
        <div className="segmented" role="radiogroup" aria-label="Photo source">
          <label>
            <input
              type="radio"
              name="mode"
              value="avatar"
              checked={mode === "avatar"}
              onChange={() => setMode("avatar")}
            />
            Build an avatar
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="upload"
              checked={mode === "upload"}
              onChange={() => setMode("upload")}
            />
            Upload a photo
          </label>
        </div>
        {mode === "avatar" ? (
          <AvatarBuilder value={avatar} onChange={setAvatar} />
        ) : (
          <div className="upload">
            <ol className="upload-steps">
              <li>
                Tap <strong>Choose file</strong> below.
              </li>
              <li>Pick a photo from your phone or computer.</li>
              <li>A preview appears here. Then fill in section 2.</li>
            </ol>
            <div className="field">
              <label htmlFor="photo">
                Your photo (cropped to passport shape; it never leaves your
                device)
              </label>
              <input
                id="photo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {filePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="upload__preview"
                src={filePreview}
                alt="Preview of the photo you chose for your passport"
              />
            )}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>2. Your particulars</legend>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="givenNames">Given names</label>
            <input
              id="givenNames"
              name="givenNames"
              required
              autoComplete="given-name"
            />
          </div>
          <div className="field">
            <label htmlFor="surname">Surname</label>
            <input id="surname" name="surname" autoComplete="family-name" />
          </div>
          <div className="field">
            <label htmlFor="gender">Gender</label>
            <input
              id="gender"
              name="gender"
              list="gender-options"
              required
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            />
            <datalist id="gender-options">
              {GENDERS.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <p className="hint">
              In your own words. Pick a suggestion or type your own.
            </p>
          </div>
          <div className="field">
            <label htmlFor="marker">Sex marker on the passport</label>
            <select
              id="marker"
              value={marker}
              onChange={(e) => {
                setMarkerTouched(true);
                setMarker(e.target.value as "F" | "M" | "X");
              }}
            >
              <option value="F">F</option>
              <option value="M">M</option>
              <option value="X">X</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pronouns">Pronouns (optional)</label>
            <input id="pronouns" name="pronouns" placeholder="e.g. she/they" />
          </div>
          <div className="field">
            <label htmlFor="dob">Date of birth (optional)</label>
            <input
              id="dob"
              name="dob"
              type="date"
              autoComplete="bday"
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="field">
            <label htmlFor="pob">Place of birth (optional)</label>
            <input id="pob" name="pob" />
          </div>
          <div className="field">
            <label htmlFor="marital">Marital status</label>
            <select
              id="marital"
              value={marital}
              onChange={(e) => setMarital(e.target.value)}
            >
              <option value="">Choose…</option>
              {MARITAL.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          {HAS_SPOUSE.has(marital) && (
            <div className="field">
              <label htmlFor="spouse">Spouse’s name</label>
              <input id="spouse" name="spouse" required />
            </div>
          )}
          <div className="field field--wide">
            <label htmlFor="address">Address (optional)</label>
            <textarea
              id="address"
              name="address"
              rows={3}
              autoComplete="street-address"
            />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>3. Oath of citizenship</legend>
        <label className="check">
          <input type="checkbox" name="agree" required />
          <span>{AGREEMENT}</span>
        </label>
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="button button--big" disabled={busy}>
        {busy ? "Printing your passport…" : "Generate my passport (PDF)"}
      </button>
      <p className="hint">
        Everything happens in your browser. Nothing you type or upload is sent
        anywhere.
      </p>

      {result && (
        <div
          className="passport-ready"
          tabIndex={-1}
          ref={status}
          role="status"
        >
          <h2>Your passport is ready</h2>
          <p>
            <a className="button" href={result.url} download={result.name}>
              Download {result.name}
            </a>
          </p>
          <ol>
            <li>
              Print the 6 pages on A4 at actual size (100%), double-sided,
              flipping on the long edge. Sheet 1 holds the covers, so you can
              print it on matte or glossy photo paper.
            </li>
            <li>
              Cut each sheet on the corner marks into two strips, then fold each
              strip in half on the dashed marks.
            </li>
            <li>
              Nest the strips: sheet 1 top strip outside, then sheet 1 bottom,
              sheet 2 top, sheet 2 bottom, sheet 3 top, sheet 3 bottom
              innermost.
            </li>
            <li>Staple or stitch along the fold. Welcome home, citizen.</li>
          </ol>
        </div>
      )}
    </form>
  );
}
