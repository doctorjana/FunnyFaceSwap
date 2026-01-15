import subprocess
from pathlib import Path

input_dir = Path(".")
output_dir = input_dir / "resized"
output_dir.mkdir(exist_ok=True)

extensions = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

for img in input_dir.iterdir():
    if img.suffix.lower() in extensions:
        out_path = output_dir / img.name
        subprocess.run([
            "magick",
            str(img),
            "-resize", "512x512>",
            str(out_path)
        ])
