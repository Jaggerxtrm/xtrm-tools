import os
import shutil

# 1. Sync new extensions to config/pi/extensions
src_dir = "cli/extensions"
dest_dir = "config/pi/extensions"

# Files we want to authoritative replace or add
authoritative_files = [
    "beads.ts",
    "main-guard.ts",
    "main-guard-post-push.ts",
    "quality-gates.ts",
    "service-skills.ts",
    "xtrm-loader.ts",
    
]

# Create core directory if it doesn't exist
os.makedirs(os.path.join(dest_dir, "core"), exist_ok=True)

# Copy core primitives
for f in os.listdir(os.path.join(src_dir, "core")):
    if f.endswith(".ts"):
        shutil.copy(os.path.join(src_dir, "core", f), os.path.join(dest_dir, "core", f))

# Copy extensions
for f in authoritative_files:
    src_path = os.path.join(src_dir, f)
    if os.path.exists(src_path):
        shutil.copy(src_path, os.path.join(dest_dir, f))
        print(f"Synced {f} to config/pi/extensions/")

# 2. Handle core/index.ts (needs adjustment because import paths will change)
# Actually, the extensions use relative imports like './core' which should still work 
# because they are siblings to the core/ folder.

print("Migration to config/pi/extensions complete.")
