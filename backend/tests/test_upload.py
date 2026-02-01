import requests
from pathlib import Path


def main() -> None:
    # Resolve image path relative to this script file
    script_dir = Path(__file__).resolve().parent
    image_path = script_dir / "images" / "test4.jpg"

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    url = "http://localhost:8000/api/v1/analyze/image"

    with image_path.open("rb") as f:
        files = {"image": (image_path.name, f, "image/jpeg")}
        resp = requests.post(url, files=files, timeout=60)

    print("Status:", resp.status_code)
    try:
        print(resp.json())
    except Exception:
        print(resp.text)


if __name__ == "__main__":
    main()
