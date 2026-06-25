#!/usr/bin/env python3
"""Small self-host import service for Monochrome.

It accepts an authenticated direct FLAC URL, downloads it server-side, and uploads it to
PocketBase using the caller's bearer token so the normal PocketBase collection rules still
protect ownership. It intentionally does not search third-party catalogues or bypass DRM.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import PurePosixPath

POCKETBASE_URL = os.environ.get("POCKETBASE_URL", "http://pocketbase:8090").rstrip("/")
MAX_IMPORT_BYTES = int(os.environ.get("MAX_IMPORT_BYTES", str(2 * 1024 * 1024 * 1024)))
PORT = int(os.environ.get("PORT", "8787"))


def is_allowed_import_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url or "")
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def is_flac_response(content_type: str | None, url: str) -> bool:
    ctype = (content_type or "").split(";", 1)[0].strip().lower()
    return ctype in {"audio/flac", "audio/x-flac"} or urllib.parse.urlparse(url).path.lower().endswith(".flac")


def sanitize_filename(filename: str | None) -> str:
    name = PurePosixPath(filename or "").name or "import.flac"
    if not name.lower().endswith(".flac"):
        name = f"{name}.flac"
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return name or "import.flac"


def content_disposition_filename(header: str | None) -> str:
    if not header:
        return ""
    match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', header, flags=re.I)
    if not match:
        return ""
    return urllib.parse.unquote(match.group(1).strip())


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def request_json(url: str, method: str = "GET", token: str | None = None, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def auth_user_id(token: str) -> str:
    data = request_json(f"{POCKETBASE_URL}/api/collections/users/auth-refresh", method="POST", token=token)
    record = data.get("record") or {}
    user_id = record.get("id")
    if not user_id:
        raise ValueError("Invalid PocketBase token")
    return user_id


def download_flac(url: str) -> tuple[str, str, int]:
    if not is_allowed_import_url(url):
        raise ValueError("Only direct http(s) FLAC URLs are supported")

    req = urllib.request.Request(url, headers={"User-Agent": "MonochromeSelfhost/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        content_type = response.headers.get("Content-Type")
        if not is_flac_response(content_type, response.geturl()):
            raise ValueError("The remote file must be a real FLAC URL or return audio/flac")
        length = response.headers.get("Content-Length")
        if length and int(length) > MAX_IMPORT_BYTES:
            raise ValueError("Remote FLAC is larger than the configured import limit")

        filename = sanitize_filename(
            content_disposition_filename(response.headers.get("Content-Disposition"))
            or PurePosixPath(urllib.parse.urlparse(response.geturl()).path).name
        )
        fd, path = tempfile.mkstemp(prefix="monochrome-import-", suffix=".flac")
        total = 0
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_IMPORT_BYTES:
                    raise ValueError("Remote FLAC is larger than the configured import limit")
                out.write(chunk)
        return path, filename, total


def multipart_upload(token: str, fields: dict[str, str], file_path: str, filename: str) -> dict:
    boundary = f"----Monochrome{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode(
                "utf-8"
            )
        )
    chunks.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"{filename}\"\r\nContent-Type: audio/flac\r\n\r\n".encode(
            "utf-8"
        )
    )
    with open(file_path, "rb") as handle:
        chunks.append(handle.read())
    chunks.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(chunks)

    req = urllib.request.Request(
        f"{POCKETBASE_URL}/api/collections/music_tracks/records",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


class ImportHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 - stdlib API
        if self.path != "/api/selfhost/import-url":
            json_response(self, 404, {"error": "Not found"})
            return

        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            json_response(self, 401, {"error": "Missing bearer token"})
            return
        token = auth.split(" ", 1)[1]

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            url = payload.get("url", "")
            user_id = auth_user_id(token)
            file_path, filename, size = download_flac(url)
            try:
                record = multipart_upload(
                    token,
                    {
                        "owner": user_id,
                        "title": payload.get("title") or sanitize_filename(filename).removesuffix(".flac"),
                        "artist": payload.get("artist") or "Unknown Artist",
                        "album": payload.get("album") or "Imported FLACs",
                        "album_artist": payload.get("album_artist") or payload.get("artist") or "Unknown Artist",
                        "duration": str(float(payload.get("duration") or 0)),
                        "track_number": str(int(payload.get("track_number") or 0)),
                        "explicit": "false",
                    },
                    file_path,
                    filename,
                )
            finally:
                try:
                    os.remove(file_path)
                except OSError:
                    pass
            json_response(self, 200, {"record": record, "size": size})
        except (ValueError, urllib.error.HTTPError) as error:
            json_response(self, 400, {"error": str(error)})
        except Exception as error:  # pragma: no cover - defensive server boundary
            json_response(self, 500, {"error": str(error)})

    def log_message(self, format: str, *args) -> None:
        print(f"[selfhost-importer] {self.address_string()} - {format % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), ImportHandler)
    print(f"Selfhost importer listening on :{PORT}")
    server.serve_forever()
