import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist"


def main():
    shutil.rmtree(OUTPUT, ignore_errors=True)
    OUTPUT.mkdir()
    for name in ("index.html", "styles.css", "app.js"):
        shutil.copy2(ROOT / name, OUTPUT / name)
    data_output = OUTPUT / "data"
    data_output.mkdir(exist_ok=True)
    shutil.copy2(ROOT / "data/asset-specs.json", data_output / "asset-specs.json")
    print(f"Built static site in {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()