#!/usr/bin/env python3
import os
import zipfile
import sys

dir_path = os.path.dirname(os.path.abspath(__file__))
output_zip = os.path.join(dir_path, "ksu-singbox.zip")

include_dirs = ["META-INF", "box", "webroot"]
include_files = [
    "customize.sh",
    "module.prop",
    "box4_service.sh",
    "uninstall.sh",
    "LICENSE",
    "README.md",
    "README_zh.md",
]

print(f"Packing KernelSU module into {output_zip}...")
if os.path.exists(output_zip):
    os.remove(output_zip)

with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for f in include_files:
        fp = os.path.join(dir_path, f)
        if os.path.exists(fp):
            zf.write(fp, f)
    for d in include_dirs:
        dp = os.path.join(dir_path, d)
        if os.path.exists(dp):
            for root, dirs, files in os.walk(dp):
                for file in files:
                    if file.endswith(".zip") or file.endswith(".tmp") or file.endswith(".bak") or "__pycache__" in root:
                        continue
                    full_p = os.path.join(root, file)
                    rel_p = os.path.relpath(full_p, dir_path)
                    zf.write(full_p, rel_p)

size_mb = os.path.getsize(output_zip) / (1024 * 1024)
print(f"Build successful: {output_zip} ({size_mb:.1f} MB)")
