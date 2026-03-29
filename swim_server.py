"""
Swim Analyzer — reads video directly from disk, no upload needed.
"""
import os, json, math, re, base64, io, urllib.request
import cv2
import numpy as np
from PIL import Image, ImageDraw
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app  = Flask(__name__, static_folder=".")
CORS(app)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llava"


# ── Video helpers ──────────────────────────────────────────────────────────────

def video_info(path):
    cap = cv2.VideoCapture(path)
    fps  = cap.get(cv2.CAP_PROP_FPS) or 30
    n    = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w    = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h    = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return {"fps": fps, "frames": n, "w": w, "h": h, "duration": n / fps}


def read_frame(path, idx=0):
    cap = cv2.VideoCapture(path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    cap.release()
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if ok else None


def sample_frames(path, n=24):
    info = video_info(path)
    idxs = [int(i * info["frames"] / n) for i in range(n)]
    cap  = cv2.VideoCapture(path)
    out  = []
    for i in idxs:
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, f = cap.read()
        if ok:
            out.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    cap.release()
    return out, info


def crop(frame, roi, vw, vh, pad=0.5):
    x, y, w, h = int(roi["x"]), int(roi["y"]), int(roi["w"]), int(roi["h"])
    px, py = int(w * pad), int(h * pad)
    return frame[max(0,y-py):min(vh,y+h+py), max(0,x-px):min(vw,x+w+px)]


def contact_sheet(crops, cols=6, cw=180, ch=120):
    rows  = math.ceil(len(crops) / cols)
    sheet = Image.new("RGB", (cols*cw, rows*ch), (12,18,28))
    draw  = ImageDraw.Draw(sheet)
    for i, c in enumerate(crops):
        r, col = divmod(i, cols)
        if c.size == 0: continue
        tile = Image.fromarray(c).resize((cw, ch), Image.LANCZOS)
        sheet.paste(tile, (col*cw, r*ch))
        draw.text((col*cw+4, r*ch+4), str(i+1), fill=(255,200,0))
    return sheet


def to_b64(img, q=82):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=q)
    return base64.b64encode(buf.getvalue()).decode()


def frame_b64(frame_rgb):
    return to_b64(Image.fromarray(frame_rgb))


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(".", "swim_ai.html")


@app.route("/preview", methods=["POST"])
def preview():
    """Return first frame of a video file already on disk."""
    path = request.json.get("path", "").strip()
    if not path or not os.path.isfile(path):
        return jsonify({"error": f"File not found: {path}"}), 404
    info  = video_info(path)
    frame = read_frame(path, 0)
    if frame is None:
        return jsonify({"error": "Could not read video"}), 500
    return jsonify({
        "frame":    frame_b64(frame),
        "width":    info["w"],
        "height":   info["h"],
        "duration": round(info["duration"], 2),
    })


@app.route("/analyze", methods=["POST"])
def analyze():
    data     = request.json
    path     = data.get("path", "").strip()
    roi      = data.get("roi")
    distance = float(data.get("distance", 100))
    stroke   = data.get("stroke", "freestyle")
    course   = data.get("course", "LCM")

    if not path or not os.path.isfile(path):
        return jsonify({"error": f"File not found: {path}"}), 404
    if not roi:
        return jsonify({"error": "No ROI provided"}), 400

    frames, info = sample_frames(path, n=24)
    dur  = info["duration"]
    vw, vh = info["w"], info["h"]

    crops  = [crop(f, roi, vw, vh) for f in frames]
    sheet  = contact_sheet(crops)
    sb64   = to_b64(sheet)

    pool_len  = 50 if course == "LCM" else 25
    n_lengths = distance / pool_len

    prompt = f"""You are a professional swimming coach analyzing a competition swim.

The image is a contact sheet of 24 equally-spaced frames (numbered, left→right top→bottom) covering the entire swim.
Each cell shows the selected swimmer cropped from the video.

Swim info:
- Stroke: {stroke.capitalize()}
- Distance: {distance}m | Pool: {pool_len}m ({course}) | Lengths: {n_lengths:.1f}
- Duration: {dur:.1f}s

Count the swimmer's arm strokes carefully across all 24 frames:
- Freestyle / Backstroke → each single arm pull = 1 stroke
- Butterfly / Breaststroke → each two-arm cycle = 1 stroke

Extrapolate to the full swim. Also note technique observations.

Respond ONLY with raw JSON (no markdown):
{{
  "total_strokes": <int>,
  "strokes_per_length": <float>,
  "strokes_per_minute": <float>,
  "confidence": "high|medium|low",
  "technique_notes": "<2-3 sentences>",
  "analysis_notes": "<how you counted>"
}}"""

    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "images": [sb64],
        "stream": False,
    }).encode()
    req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        resp_data = json.loads(r.read())
    raw = resp_data.get("response", "")
    m   = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        return jsonify({"error": "Bad Claude response", "raw": raw}), 500

    cd  = json.loads(m.group())
    spd = round(distance / dur, 3) if dur else 0
    p   = round(100 / spd, 2) if spd else 0
    ts  = cd.get("total_strokes", 0)

    return jsonify({
        "speed_ms":           spd,
        "pace":               f"{int(p//60)}:{str(round(p%60,1)).zfill(4)}",
        "duration":           round(dur, 1),
        "total_strokes":      ts,
        "strokes_per_length": round(cd.get("strokes_per_length", ts/n_lengths if n_lengths else 0), 1),
        "strokes_per_minute": round(cd.get("strokes_per_minute", ts/(dur/60) if dur else 0), 1),
        "confidence":         cd.get("confidence", "medium"),
        "technique_notes":    cd.get("technique_notes", ""),
        "analysis_notes":     cd.get("analysis_notes", ""),
        "contact_sheet":      sb64,
    })


if __name__ == "__main__":
    print("🏊 Swim Analyzer → http://localhost:5050")
    app.run(port=5050, debug=False)
