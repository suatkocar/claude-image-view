#!/usr/bin/env python3
"""Exercise the mod with real local files and converters in a temporary plugin copy."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import zlib


def command(argv):
    result = subprocess.run(argv, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"{argv[0]} exited {result.returncode}: {result.stderr}")


def main():
    repo = Path(__file__).resolve().parents[1]
    for executable in ("bun", "sips", "ffmpeg", "cwebp"):
        if not shutil.which(executable):
            raise RuntimeError(f"Required for this macOS integration check: {executable}")
    with tempfile.TemporaryDirectory(prefix="image-view-real-") as temporary:
        root = Path(temporary)
        plugin = root / "plugin"
        for directory in ("hooks", "types"):
            shutil.copytree(repo / directory, plugin / directory)
        (plugin / ".claude-plugin").mkdir()
        shutil.copy2(repo / ".claude-plugin/plugin.json", plugin / ".claude-plugin/plugin.json")
        cache = root / "cache"
        images = cache / f"claude-{os.getuid()}/project/session/images"
        images.mkdir(parents=True)

        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

        width, height = 1600, 1000
        raw = b"".join(b"\0" + bytes([40 + (y // 100) * 15, 130, 210, 255]) * width for y in range(height))
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
        original = images / "1.png"
        original.write_bytes(png)
        formats = ["png", "jpg", "webp", "heic", "tiff", "gif"]
        for number, extension in enumerate(formats[1:], 2):
            target = images / f"{number}.{extension}"
            if extension == "webp":
                command(["cwebp", "-quiet", "-lossless", str(original), "-o", str(target)])
            else:
                command(["sips", "-s", "format", "jpeg" if extension == "jpg" else extension, str(original), "--out", str(target)])
        before = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in images.iterdir()}
        shutil.copy2(repo / "scripts/real-image-host.ts", plugin / "run.ts")
        host = plugin / "node_modules/claude-code"
        host.mkdir(parents=True)
        (host / "package.json").write_text(json.dumps({"name": "claude-code", "type": "module", "exports": "./index.js"}))
        (host / "index.js").write_text("""
export const atom = (_, value) => ({ value });
export const read = async (_, atom) => atom.value;
export const update = async (_, atom, change) => { atom.value = change(atom.value); };
""")
        (plugin / "tsconfig.json").write_text(json.dumps({"compilerOptions": {"jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment"}}))
        result = subprocess.run(["bun", "run.ts", str(cache), json.dumps(formats)], cwd=plugin)
        after = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in images.iterdir()}
        if before != after:
            raise RuntimeError("Source attachment bytes changed during preview generation")
        if result.returncode:
            raise SystemExit(result.returncode)
        print("Real image checks passed; all six source attachment hashes remained unchanged.")


if __name__ == "__main__":
    main()
