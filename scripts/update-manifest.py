#!/usr/bin/env python3
"""扫描 assets 并更新 assets-manifest.js 中的 backgrounds 列表"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG_DIR = os.path.join(ROOT, "assets", "背景图片")
MANIFEST = os.path.join(ROOT, "assets-manifest.js")
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

bgs = []
if os.path.isdir(BG_DIR):
    for name in sorted(os.listdir(BG_DIR)):
        if os.path.splitext(name)[1].lower() in EXTS:
            bgs.append("assets/背景图片/" + name)

with open(MANIFEST, encoding="utf-8") as f:
    text = f.read()

text = re.sub(
    r"backgrounds:\s*\[[^\]]*\]",
    "backgrounds: " + json.dumps(bgs, ensure_ascii=False, indent=2).replace("\n", "\n  "),
    text,
)

with open(MANIFEST, "w", encoding="utf-8") as f:
    f.write(text)

print(f"已更新 {len(bgs)} 张背景图:", bgs)
