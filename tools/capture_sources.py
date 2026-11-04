"""Capture public primary-source evidence without accounts or browser profiles.

This is a research utility, not a submission bot. It never decides eligibility.
Only the response Date header is retained; cookies and other headers are omitted.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import ipaddress
import json
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 2_000_000


def validate_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        raise ValueError("Sources must be public HTTPS URLs without credentials")
    host = parts.hostname.lower()
    if host == "localhost" or host.endswith((".local", ".localhost")):
        raise ValueError("Local source hosts are not allowed")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("Private source addresses are not allowed")
    return url


class PublicRedirect(HTTPRedirectHandler):
    max_redirections = 5
    http_error_308 = HTTPRedirectHandler.http_error_302

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        if code == 308 and req.get_method() == "GET":
            return Request(newurl, headers=dict(req.header_items()))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


public_open = build_opener(PublicRedirect()).open


class PublicText(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.parts: list[str] = []
        self.links: list[dict[str, str]] = []
        self.hidden = 0
        self.anchor: dict[str, str] | None = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"script", "style"}:
            self.hidden += 1
        if self.hidden:
            return
        if tag == "a" and attrs.get("href"):
            self.anchor = {"url": urljoin(self.base_url, attrs["href"]), "label": ""}
            self.links.append(self.anchor)
        if tag in {"h1", "h2", "h3", "h4", "p", "li", "tr", "br", "div", "section"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.hidden:
            self.hidden -= 1
        if tag == "a":
            self.anchor = None
        if not self.hidden and tag in {"h1", "h2", "h3", "h4", "p", "li", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)
            if self.anchor is not None:
                self.anchor["label"] += data

    def result(self):
        lines = [re.sub(r"\s+", " ", line).strip() for line in "".join(self.parts).splitlines()]
        text = "\n".join(line for line in lines if line)
        links = [dict(url=link["url"], label=re.sub(r"\s+", " ", link["label"]).strip())
                 for link in self.links if urlsplit(link["url"]).scheme == "https"]
        return text, links


def capture(source: dict, opener=public_open) -> dict:
    source_id = source["id"]
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", source_id):
        raise ValueError("Invalid source identifier")
    url = validate_url(source["url"])
    result = {
        "id": source_id,
        "requested_url": url,
        "fetched_at_utc": datetime.now(timezone.utc).isoformat(),
        "http_status": None,
        "final_url": url,
        "server_date": None,
        "body_sha256": None,
        "text": "",
        "links": [],
        "error": None,
    }
    request = Request(url, headers={"User-Agent": "RewardCatalogResearch/1.0", "Accept": source.get("accept", "text/html,application/json,text/plain")})
    try:
        try:
            response = opener(request, timeout=25)
        except HTTPError as error:
            response = error
        with response:
            result["http_status"] = response.status
            result["final_url"] = validate_url(response.geturl())
            result["server_date"] = response.headers.get("Date")
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError("Source exceeds the evidence size limit")
            result["body_sha256"] = hashlib.sha256(body).hexdigest()
            decoded = body.decode(response.headers.get_content_charset() or "utf-8", errors="replace")
            media_type = response.headers.get_content_type()
            if media_type == "text/html":
                parser = PublicText(result["final_url"])
                parser.feed(decoded)
                result["text"], result["links"] = parser.result()
            elif media_type == "application/json":
                document = json.loads(decoded)
                # Stable public event facts, not expiring image signatures or card styling.
                if source_id == "hackclub-events" and isinstance(document, dict):
                    keys = ("id", "slug", "name", "description", "url", "status", "startDate", "endDate", "format", "requirements", "projectTypes")
                    document = {"meta": document.get("meta"), "data": [{key: event.get(key) for key in keys} for event in document.get("data", [])]}
                result["json"] = document
                result["text"] = json.dumps(document, indent=2, ensure_ascii=False)
            else:
                result["text"] = decoded
    except (URLError, TimeoutError, OSError, ValueError) as error:
        # Never convert a fetch failure into a conclusion that the program closed.
        result["error"] = type(error).__name__ + ": " + str(error)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ids", nargs="*", help="Optional exact source IDs to refresh")
    args = parser.parse_args()
    sources = json.loads((ROOT / "sources/manifest.json").read_text())
    identifiers = [source["id"] for source in sources]
    if len(set(identifiers)) != len(identifiers):
        parser.error("Duplicate source identifiers")
    if set(args.ids) - set(identifiers):
        parser.error("Unknown source identifier")
    selected = [source for source in sources if not args.ids or source["id"] in args.ids]
    destination = ROOT / "sources/captured"
    destination.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(capture, selected):
            (destination / (result["id"] + ".json")).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
            print(result["id"], result["http_status"], "FETCH ERROR" if result["error"] else "captured")


if __name__ == "__main__":
    main()
