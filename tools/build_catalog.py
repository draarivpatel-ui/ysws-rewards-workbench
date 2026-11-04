"""Build a dated catalog from captured public evidence and explicit claims.

Directory membership, readable rules, entrant eligibility and delivered rewards
are distinct. This generator never submits, authenticates or awards anything.
"""
from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
GENERAL_ELIGIBILITY = "Hack Club standard terms require ages 13 to 18 inclusive; eligibility ends on the 19th birthday. Minors need parent/guardian consent. Program-specific restrictions and organizer discretion also apply."
SOURCE_ALIASES = {"boba-drops": "boba", "hackcraft-mod-edition": "hackcraft"}
LEGACY_IDS = ["blot", "cider", "onboard", "the-bin", "retrospect", "high-seas", "frame", "save-point", "stardance", "orpheusathon"]
ADDITIONAL_IDS = ["waffles", "downscale", "terminalcraft", "club-start-grant", "cloudfall", "gadget-market", "cq", "raspapi", "tagless", "enclosure", "hacklet", "jame-gam", "foodie", "storyboard", "carnival", "3am", "resolution"]


def normalize(text):
    return re.sub(r"\s+", " ", str(text).replace("\u2013", "-").replace("\u2014", "-").replace("\u2019", "'").replace("\u2018", "'")).strip()


def markdown(text):
    text = normalize(text).replace("|", "\\|")
    return re.sub(r"\$\d[\d,]*(?:\.\d+)?(?:-\d[\d,]*(?:\.\d+)?)?", lambda match: "`" + match.group(0) + "`", text)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_sources(root=ROOT):
    manifest = read_json(root / "sources/manifest.json")
    sources = {}
    for item in manifest:
        path = root / "sources/captured" / (item["id"] + ".json")
        if path.exists():
            source = read_json(path)
            if source["id"] != item["id"] or source["requested_url"] != item["url"]:
                raise ValueError("Capture identity does not match its source manifest")
            sources[item["id"]] = source
    return sources


def readable(source):
    return source is not None and source.get("http_status") == 200 and not source.get("error") and bool(source.get("text", "").strip())


def verify_claims(claims, sources):
    for claim in claims:
        for source_id in claim.get("sources", []):
            if source_id not in sources:
                raise ValueError("A referenced source has not been captured: " + source_id)
        for evidence in claim.get("evidence", []):
            source = sources.get(evidence["source"])
            if not readable(source):
                raise ValueError("Claim evidence is not readable: " + evidence["source"])
            if normalize(evidence["quote"]).casefold() not in normalize(source["text"]).casefold():
                raise ValueError("Claim excerpt does not occur in its primary source: " + evidence["source"])


def event_state(event, today):
    # Calendar dates have no verified timezone/end-of-day cutoff. Do not invent one.
    if event["slug"] == "thirdspace":
        return "directory-ongoing-signups-closed"
    if event["slug"] == "goship":
        return "directory-ongoing-timing-conflict"
    if event.get("startDate") and event["startDate"] > today:
        return "upcoming-by-start-date"
    if event.get("endDate") and event["endDate"] < today:
        return "directory-date-conflict"
    return event["status"]


def hackclub_programs(events, claims, today):
    result = []
    active = [event for event in events if event["status"] in {"ongoing", "upcoming"}]
    if set(claims) != {event["slug"] for event in active}:
        raise ValueError("Every ongoing/upcoming Hack Club entry must have an explicit reviewed claim record")
    for event in active:
        claim = claims[event["slug"]]
        additional = {
            "boba-drops": "Individuals must be US-based; official club workshops can be worldwide.",
            "club-shop": "Requires a real official Hack Club and qualifying club activity.",
            "flavorless": "Official club membership and workshop/project shipping are required.",
            "vibes": "Official club participation and genuine student-edit/add-feature steps are required.",
            "swirl": "Current page says clubs only; the requirements also exclude previous Swirl grant recipients.",
            "snowglobe": "Girls/girl-identifying participants only.",
            "texel": "Prior Hack Club program bans are expressly excluded by the program page.",
            "thirdspace": "New signups are closed; existing cohort work is a separate question.",
            "haven": "Actual in-person event participation and signed parental consent, not an online claim."
        }.get(event["slug"], "Additional program-specific account, regional and artifact conditions must be honored.")
        result.append({
            "id": event["slug"], "directory_id": event["id"], "name": normalize(event["name"]),
            "url": event["url"], "directory_status": event["status"], "state": event_state(event, today),
            "start_date": event.get("startDate"), "end_date": event.get("endDate"), "format": event.get("format"),
            "directory_description": normalize(event.get("description") or "No description supplied by the directory."),
            "eligibility": GENERAL_ELIGIBILITY + " " + additional,
            "tracking": claim.get("tracking", "not-established"),
            "time_requirement": claim.get("time_requirement", "No complete current time requirement was established from the checked public rules. Do not assume that an hour-based program is non-Hackatime."),
            "ai_policy": claim.get("ai_policy", "not-established"),
            "artifact": claim["artifact"], "reward": claim["reward"],
            "reward_guarantee": "Subject to availability, acceptance and Hack Club's sole discretion under the current standard terms.",
            "submission_url": claim.get("submission_url"),
            "sources": ["hackclub-events", "hackclub-terms", *claim["sources"]], "evidence": claim.get("evidence", [])
        })
    return result


def devpost_programs(sources, state, required_prefixes):
    events = {}
    totals = set()
    for source_id in required_prefixes:
        source = sources.get(source_id)
        if not readable(source) or "json" not in source:
            raise ValueError("A Devpost feed page is missing or unreadable: " + source_id)
        document = source["json"]
        if document.get("meta", {}).get("fuzzy"):
            raise ValueError("Fuzzy search is discovery only, not a complete event feed")
        totals.add(document["meta"]["total_count"])
        for event in document["hackathons"]:
            if event["open_state"] != state or event.get("displayed_location", {}).get("location") != "Online":
                raise ValueError("The requested online event filter was not honored")
            if event["id"] in events:
                raise ValueError("Duplicate event across pagination; refresh the feed")
            amount = normalize(re.sub(r"<[^>]+>", "", event.get("prize_amount", "Not listed")))
            events[event["id"]] = {
                "id": "devpost-" + str(event["id"]), "name": normalize(event["title"]), "url": event["url"],
                "state": state, "dates_as_published": event["submission_period_dates"],
                "listed_prize_amount": amount, "rules_url": event["url"].rstrip("/") + "/rules",
                "eligibility": "Not established by the listing API. Age, geography, originality, build window, required technology and parental consent must be verified from the current event rules before entry.",
                "tracking": "No Hackatime requirement established from this listing; complete rules remain necessary.",
                "artifact": "Current rules must define the project, repository/deployment, technology use, video and form fields. A title alone does not establish them.",
                "participation_reward": "Not established. Listed total prize value is not a guaranteed participation reward or necessarily cash.",
                "sources": [source_id]
            }
    if len(totals) != 1 or len(events) != next(iter(totals)):
        raise ValueError("Devpost pagination did not cover the complete reported result count")
    return list(events.values())


def source_link(source_id, sources):
    source = sources[source_id]
    return "[" + source_id + "](" + source["requested_url"] + ")"


def build(root=ROOT):
    sources = load_sources(root)
    if not readable(sources.get("hackclub-events")) or not readable(sources.get("hackclub-terms")):
        raise ValueError("The authoritative directory and standard terms must be readable")
    directory = sources["hackclub-events"]
    server_time = parsedate_to_datetime(directory["server_date"]) if directory.get("server_date") else datetime.fromisoformat(directory["fetched_at_utc"])
    today = server_time.astimezone(ZoneInfo("America/Chicago")).date().isoformat()
    claims = read_json(root / "catalog_claims.json")
    external = read_json(root / "external_programs.json")
    verify_claims([*claims.values(), *external], sources)
    programs = hackclub_programs(directory["json"]["data"], claims, today)
    opened = devpost_programs(sources, "open", ["devpost-public-feed", *["devpost-open-" + str(page) for page in range(2, 7)]])
    upcoming = devpost_programs(sources, "upcoming", ["devpost-upcoming-" + str(page) for page in range(1, 7)])
    legacy = [event for event in directory["json"]["data"] if event["slug"] in LEGACY_IDS]
    snapshot = {
        "schema_version": 1, "as_of_local_date": today, "timezone": "America/Chicago",
        "directory_fetched_at_utc": directory["fetched_at_utc"], "directory_server_date": directory["server_date"],
        "coverage": {"hackclub_directory_current": len(programs), "devpost_open_online": len(opened), "devpost_upcoming_online": len(upcoming), "external_offers_and_exclusions": len(external)},
        "scope_limit": "Complete coverage of the captured official Hack Club current directory and the captured Devpost open/upcoming online feeds; not a claim that every worldwide grant was discoverable or that every listed program is eligible for this entrant.",
        "hackclub": programs, "external": external, "hackathons": opened + upcoming,
        "legacy_directory_entries": [{key: event.get(key) for key in ("slug", "name", "status", "startDate", "endDate", "url")} for event in legacy]
    }
    (root / "programs.json").write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lines = [
        "# Active reward programs and engineering pipeline 2026", "",
        "Verified public-source snapshot for " + today + " in America/Chicago. The directory server Date was " + directory["server_date"] + ".", "",
        "This catalog distinguishes an advertised program, readable rules, entrant eligibility, approval and an actually delivered reward. No entry, account, appeal, claim, domain registration or payment was changed.", "",
        "## What is covered", "",
        f"All {len(programs)} ongoing/upcoming entries returned by the official Hack Club events API, all {len(opened)} open and {len(upcoming)} upcoming online entries returned by the paginated Devpost public feed, and selected developer/student grant offers. This is not an assertion that every worldwide grant is discoverable or every program is open to this entrant.", "",
        "The requested old https://hackclub.com/ysws/ path resolves to a real 404 in this check. https://ysws.hackclub.com explicitly says it is deprecated and points to https://hackclub.com/programs. The official API, https://hackclub.com/api/v1/events, supersedes stale catalog status. GitHub's YSWS-Catalog was inspected for additional leads, not used as proof that expired programs are open.", "",
        "## Honesty and eligibility gates", "",
        "- Hack Club's current terms explicitly make all awards subject to availability and its sole discretion. None is labelled an unconditional legal guarantee here.",
        "- Ages 13 to 18 and parent/guardian consent apply under the standard terms; program-specific restrictions still matter. A prior program ban must not be bypassed with another account. Texel expressly excludes prior program bans.",
        "- No hours were invented, backdated or billed twice. Agent-written code is not evidence of human coding/CAD time. A direct PR/form does not waive an originality or time requirement.",
        "- AI-assisted software is disclosed. Boba Drops, Swirl, Waffles, Folktale, FuseRing and ASIC restrict or ban relevant AI work; Sprig requires a primarily human-created game. Do not submit these generated artifacts to those lanes.",
        "- IDs, enrollment documents, guardian details, shipping addresses and credentials belong only in an authorized private organizer/registrar flow, never a public repository. Applicant personal statements come from the applicant.",
        "- A pre-built TaalTrainer/StepCheck cannot be presented as newly authored during an upcoming competition. Read its current originality/build-window rules first.", "",
        "## Highest-value next actions", "",
        "1. Vibes is an explicitly AI-friendly club workshop route. The two code artifacts below are honest seeds; a real official club, student edits, student-added features and workshop approval remain required. Generated code alone is not a completed entry.",
        "2. The 8-Pin Grant is a verified manual-journal hardware lane, up to `$35` after review. The BOM workbench supports real quote preparation; it is not a qualifying KiCad PCB, a seven-hour human journal or proof of fabricated hardware.",
        "3. Bagel Fund and 1517 Medici accept real project applications for selected microgrants/stipends. Use genuine project evidence and applicant-authored motivation; these are competitive/discretionary grants, not participation cash.",
        "4. The Student Developer Pack lists domains and compute, but partner/minor/registration gates remain. Azure's `$100` college offer is 18+; the separate 13-to-17 service offer is not that credit. Namecheap's current university wording conflicts with a generic teen assumption.",
        "5. Atlantis uses real CAD timelapses rather than Hackatime, but a new eight-week claim cannot be backfilled before its current end date. Many attractive hardware routes below are hour-based or have unresolved tracker/originality details.", "",
        "## Built artifacts and remaining submission work", "",
        "- [Grant BOM Workbench](artifacts/grant-bom-workbench/README.md) is a complete no-CSS local web tool with exact USD arithmetic, allowed-supplier quote validation, stale-quote warnings and validated JSON import/export. No real prices are prefilled. Its code can be shipped as disclosed software; grant eligibility is separate.",
        "- [Build Evidence Kit](artifacts/build-evidence-kit/README.md) is a complete local selected-text privacy/manifest tool, in browser and Node CLI. It hashes actual bytes, reports redacted findings and never claims complete privacy/security, authorship, human hours or reward eligibility.",
        "- The upgraded sibling TaalTrainer and StepCheck are tested software projects, not verified new contest entries. See their ENGINEERING.md files and [VERIFICATION.md](VERIFICATION.md) for executed checks and review status.", "",
        "## Current Hack Club directory entries", "",
        "Dates below are directory calendar dates, not invented timezone-specific deadlines. The program page can contradict the directory; conflicts are recorded, not silently resolved. A tracker marked not-established is not a non-Hackatime endorsement.", ""
    ]
    for program in programs:
        lines.extend([
            "### " + program["name"], "",
            "Program " + program["url"],
            "State " + program["state"] + "; directory " + program["directory_status"] + ". Start " + str(program["start_date"]) + "; end " + (program["end_date"] or "no end date supplied") + ".", "",
            "Eligibility " + markdown(program["eligibility"]), "",
            "Tracking " + program["tracking"] + ". " + markdown(program["time_requirement"]), "",
            "AI policy " + program["ai_policy"] + ". " + ("If not established, obtain the actual policy before a submission." if "not-established" in program["ai_policy"] else "Read the linked program-specific policy; do not transfer another program's rules."), "",
            "Required artifact " + markdown(program["artifact"]), "",
            "Advertised reward " + markdown(program["reward"]) + " " + program["reward_guarantee"], "",
            "Sources " + ", ".join(source_link(source_id, sources) for source_id in program["sources"]) + ".", ""
        ])
        if program["submission_url"]:
            lines.extend(["Submission route " + program["submission_url"] + " (not submitted in this run).", ""])
    lines.extend(["## Developer and microgrant offers", ""])
    for program in external:
        lines.extend(["### " + program["name"], "", "URL " + program["url"], "State " + program["status"] + ". Tracking " + program["tracking"] + ".", "", "Eligibility " + markdown(program["eligibility"]), "", "Required artifact " + markdown(program["artifact"]), "", "Advertised benefit " + markdown(program["reward"]), "", "Sources " + ", ".join(source_link(source_id, sources) for source_id in program["sources"]) + ".", ""])
    lines.extend(["## Open and upcoming online hackathons", "", "The listing API verifies published state, date strings and listed prize totals only. It does not expose complete age/originality/technology rules or establish guaranteed participation gifts. Every row has a rules link; verify it before an entry. Calendar windows do not imply permission to reuse pre-built work.", "", "TaalTrainer's historical IceHacks association and StepCheck's United Hacks V8 association are planning context only. The current listing places IceHacks on November 8 to 15, 2026 and United Hacks V8 on January 8 to 10, 2027. Build-window/AI/entrant eligibility were not established by the listing alone.", "", "| Program and exact URL | State | Dates exactly as published | Listed total prize value | Eligibility and artifact gate |", "| --- | --- | --- | --- | --- |"])
    for program in opened + upcoming:
        lines.append("| [" + markdown(program["name"]) + "](" + program["url"] + ") | " + program["state"] + " | " + markdown(program["dates_as_published"]) + " | " + markdown(program["listed_prize_amount"]) + " | [Current rules](" + program["rules_url"] + "); age/originality/AI/required tech/artifact and participation rewards not yet established |")
    lines.extend(["", "The feed contains events beyond this campaign horizon and low-information listings. A listed prize pool, a zero listed amount, an open flag or an impressive title is not proof of a cash award, teen eligibility or organizer reliability.", "", "## Closed and historical corrections", "", "| Program | Official directory state | Directory end | Primary URL |", "| --- | --- | --- | --- |"])
    for event in legacy:
        url = event.get("url") or sources["bin"]["requested_url"]
        lines.append("| " + markdown(event["name"]) + " | " + event["status"] + " | " + str(event.get("endDate")) + " | " + url + " |")
    lines.extend(["", "Blot's live page expressly says the YSWS ended; its old README still advertises kits. High Seas expressly says it ended. Cider's legacy page also requires 40 Hackatime hours, independently of its ended directory state. OnBoard, The Bin and Retrospect are not current direct-reward lanes in the official directory. OrpheusAthon's ended flag and future-looking end date conflict; do not infer a reopened claim. Pending old applications or a green PR test are not delivered rewards.", "", "## Additional GitHub and club-page leads", "", "These were checked because the deprecated catalog or current club page linked them. A surviving page is not proof of an open reward program. Where a complete timing/AI/eligibility clause or current open state was not established, no generated entry is routed there.", "", "| Lead | Checked primary URL | HTTP result | Evidence boundary |", "| --- | --- | --- | --- |"])
    for source_id in ADDITIONAL_IDS:
        source = sources[source_id]
        lines.append("| " + source_id + " | " + source["requested_url"] + " | " + str(source["http_status"]) + " | Read the captured page; not an unconditional active/eligible reward claim |")
    lines.extend(["", "Waffles' current requirements explicitly ban AI and require 2 Hackatime hours. Downscale's page says clubs are open while the individual route is coming soon. The Club Starter Grant explicitly requires 3+ Hackatime hours. CQ displays sponsor pending. Gadget Market advertises up to USD 210 build and USD 30 shipping grants, but the complete current time/AI/open-state requirements were not verified. These leads are not silently called guaranteed non-Hackatime programs.", "", "## Source provenance and refresh", "", "Captures are local-only in sources/captured and are excluded from publication. Each records its requested/final URL, actual UTC fetch time, HTTP status, server Date, response-body SHA-256 and extracted public text. Cookies and other response headers are not retained. Excerpt assertions verify that cited claim fragments occur in readable primary evidence. A fetch error or 403 never becomes a fabricated closure or eligibility conclusion.", "", "Regenerate from already captured evidence with:", "", "```sh", "python3 tools/build_catalog.py", "```", "", "Refresh selected public source IDs with tools/capture_sources.py, re-read changed rules and edit the claim records before rebuilding. Never automatically carry a prior date or AI permission into a new program. Complete feed pagination is checked; a changed result count is a refresh failure, not a partial catalog labelled complete.", "", "See programs.json for structured facts and coverage, sources/manifest.json for exact researched URLs, and VERIFICATION.md for the local code/review/publishing checkpoint. No absolute defect-free, guaranteed-award or worldwide-exhaustiveness claim is made.", ""])
    (root / "ACTIVE_REWARD_PROGRAMS_2026.md").write_text("\n".join(lines), encoding="utf-8")
    return snapshot


if __name__ == "__main__":
    snapshot = build()
    print(json.dumps(snapshot["coverage"], sort_keys=True))
