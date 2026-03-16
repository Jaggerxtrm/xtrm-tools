import os
import shutil

src_dir = "cli/extensions"
dest_dir = "config/pi/extensions"

# authoritative_files (main extensions)
authoritative_files = [
    "beads.ts",
    "main-guard.ts",
    "main-guard-post-push.ts",
    "quality-gates.ts",
    "service-skills.ts",
    "xtrm-loader.ts",
    "custom-footer.ts"
]

# Create core directory if it doesn't exist
os.makedirs(os.path.join(dest_dir, "core"), exist_ok=True)

# Remove index.ts if it exists in dest to fix the bug
index_path = os.path.join(dest_dir, "core", "index.ts")
if os.path.exists(index_path):
    os.remove(index_path)
    print(f"Removed stale {index_path}")

# Copy core primitives
for f in os.listdir(os.path.join(src_dir, "core")):
    if f.endswith(".ts"):
        shutil.copy(os.path.join(src_dir, "core", f), os.path.join(dest_dir, "core", f))
        print(f"Copied core/{f}")

# Copy extensions
for f in authoritative_files:
    src_path = os.path.join(src_dir, f)
    if os.path.exists(src_path):
        shutil.copy(src_path, os.path.join(dest_dir, f))
        print(f"Synced {f} to config/pi/extensions/")

print("Migration to config/pi/extensions complete.")
