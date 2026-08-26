from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict
from pathlib import Path
from typing import Any

from starme.byteplus_assets import BytePlusAssetClient
from starme.config import get_settings
from starme.media_pipeline import extract_shot, structural_quality_report
from starme.render_pipeline import SeedanceRenderSpec, execute_seedance_render
from starme.seedance import SeedanceClient


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Guarded StarME Seedance operator tooling")
    commands = parser.add_subparsers(dest="command", required=True)

    auth = commands.add_parser("auth-check", help="Validate the API key without creating a task")
    auth.add_argument("--task-id", default="starme-auth-check-nonexistent")

    extract = commands.add_parser("extract-shot", help="Create silent shot and original audio")
    extract.add_argument("source", type=Path)
    extract.add_argument("--start", type=float, required=True)
    extract.add_argument("--duration", type=float, required=True)
    extract.add_argument("--video", type=Path, required=True)
    extract.add_argument("--audio", type=Path, required=True)

    scan = commands.add_parser(
        "scan-shots",
        help="Derive the swap manifest from the master by finding the original lead",
    )
    scan.add_argument("master", type=Path, help="Episode master video")
    scan.add_argument(
        "--lead-portrait", type=Path, required=True,
        help="Still of the ORIGINAL lead actor, e.g. media/shells/<id>/role-original.png",
    )
    scan.add_argument("--episode", type=int, required=True)
    scan.add_argument("--role", default="Arjun", help="Manifest character name of the lead")
    scan.add_argument("--co-stars", default="", help="Other names for the characters field")
    scan.add_argument(
        "--out", type=Path, default=None,
        help="Write the manifest here. Without it, only the report is printed.",
    )
    scan.add_argument(
        "--merge-into", type=Path, default=None,
        help="Existing manifest to merge into, replacing only this episode's entries",
    )

    quality = commands.add_parser("quality", help="Run structural output quality gates")
    quality.add_argument("source", type=Path)
    quality.add_argument("output", type=Path)

    render = commands.add_parser("render", help="Run one explicitly authorized billable proof")
    render.add_argument("spec", type=Path, help="JSON SeedanceRenderSpec file")
    render.add_argument(
        "--confirm-billable",
        action="store_true",
        help="Required safety acknowledgement before task creation",
    )

    groups = commands.add_parser("asset-groups", help="List verified portrait asset groups")
    groups.add_argument("--limit", type=int, default=10)

    liveness = commands.add_parser("liveness-start", help="Create a real-person H5 session")
    liveness.add_argument(
        "--session-file", type=Path, default=Path("tmp/byteplus/liveness-session.json")
    )

    result = commands.add_parser("liveness-result", help="Retrieve the verified asset group")
    result.add_argument(
        "--session-file", type=Path, default=Path("tmp/byteplus/liveness-session.json")
    )

    asset = commands.add_parser("asset-create", help="Create and wait for a portrait asset")
    asset.add_argument("--group-id", required=True)
    asset.add_argument("--url", required=True)
    asset.add_argument("--name")

    register = commands.add_parser(
        "register-face",
        help="Operator route: host a named tester's portrait transiently and "
        "register it as a private asset:// reference",
    )
    register.add_argument("--file", type=Path, required=True, help="Local portrait image")
    register.add_argument("--name", required=True, help="Tester reference, e.g. Amol-RMX3782")

    status = commands.add_parser("asset-status", help="Retrieve portrait asset status")
    status.add_argument("asset_id")
    return parser


def _settings_client() -> SeedanceClient:
    settings = get_settings()
    if settings.byteplus_api_key is None:
        raise RuntimeError("STARME_BYTEPLUS_API_KEY is required in .env")
    return SeedanceClient(
        api_key=settings.byteplus_api_key.get_secret_value(),
        base_url=settings.byteplus_api_base_url,
    )


def _load_spec(path: Path) -> SeedanceRenderSpec:
    data: Any = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise ValueError("Render specification must be a JSON object")
    return SeedanceRenderSpec.from_dict(data)


def _asset_client() -> BytePlusAssetClient:
    settings = get_settings()
    if settings.byteplus_access_key is None or settings.byteplus_secret_key is None:
        raise RuntimeError("BytePlus AK/SK credentials are required in .env")
    return BytePlusAssetClient(
        access_key=settings.byteplus_access_key.get_secret_value(),
        secret_key=settings.byteplus_secret_key.get_secret_value(),
        region=settings.byteplus_region,
        project_name=settings.byteplus_project_name,
    )


def main() -> None:
    args = _parser().parse_args()
    if args.command == "asset-groups":
        groups = _asset_client().list_groups(page_size=args.limit)
        safe = [{key: item.get(key) for key in ("Id", "Name", "Status")} for item in groups]
        print(json.dumps(safe, indent=2))
        return
    if args.command == "liveness-start":
        settings = get_settings()
        session = _asset_client().create_liveness_session(settings.byteplus_liveness_callback_url)
        args.session_file.parent.mkdir(parents=True, exist_ok=True)
        args.session_file.write_text(json.dumps(asdict(session), indent=2) + "\n")
        os.chmod(args.session_file, 0o600)
        print(f"Liveness session saved securely to {args.session_file}")
        print(f"Open this link within 30 minutes:\n{session.h5_link}")
        return
    if args.command == "liveness-result":
        data = json.loads(args.session_file.read_text())
        group_id = _asset_client().get_liveness_group(str(data["byted_token"]))
        data["group_id"] = group_id
        args.session_file.write_text(json.dumps(data, indent=2) + "\n")
        os.chmod(args.session_file, 0o600)
        print(json.dumps({"group_id": group_id}, indent=2))
        return
    if args.command == "asset-create":
        asset_client = _asset_client()
        asset_id = asset_client.create_asset(
            group_id=args.group_id, source_url=args.url, name=args.name
        )
        active = asset_client.wait_for_asset(asset_id)
        print(json.dumps({"asset_id": active.id, "asset_uri": active.uri}, indent=2))
        return
    if args.command == "register-face":
        settings = get_settings()
        if not settings.byteplus_asset_group_id:
            raise SystemExit("STARME_BYTEPLUS_ASSET_GROUP_ID is required in .env")
        from starme.linode_storage import LinodeObjectStorage

        storage = LinodeObjectStorage.from_settings(settings)
        if storage is None:
            raise SystemExit("STARME_LINODE_* hosting settings are required in .env")
        suffix = args.file.suffix.lower()
        content_type = "image/png" if suffix == ".png" else "image/jpeg"
        key = storage.object_key(f"{args.name}{suffix}")
        storage.put(key, args.file.read_bytes(), content_type)
        try:
            active = _asset_client().ensure_active_asset(
                group_id=settings.byteplus_asset_group_id,
                source_url=storage.public_url(key),
                asset_type="Image",
                name=args.name,
            )
        finally:
            storage.delete(key)
        print(
            json.dumps(
                {
                    "tester_reference": args.name,
                    "asset_uri": active.uri,
                    "next_step": "Add to STARME_TESTER_FACE_ASSETS in the server .env, e.g. "
                    f'{{"{args.name}": "{active.uri}"}}',
                },
                indent=2,
            )
        )
        return
    if args.command == "asset-status":
        asset = _asset_client().get_asset(args.asset_id)
        print(
            json.dumps(
                {"asset_id": asset.id, "status": asset.status, "asset_uri": asset.uri},
                indent=2,
            )
        )
        return
    if args.command == "auth-check":
        try:
            with _settings_client() as seedance_client:
                seedance_client.retrieve(args.task_id)
        except Exception as exc:  # noqa: BLE001 - CLI reports provider-safe error text
            if "HTTP 404" in str(exc) or "ResourceNotFound" in str(exc):
                print("Authentication accepted; nonexistent task returned expected 404.")
                return
            raise
        print("Authentication accepted; task exists.")
        return
    if args.command == "extract-shot":
        video, audio = extract_shot(
            args.source,
            start_seconds=args.start,
            duration_seconds=args.duration,
            video_destination=args.video,
            audio_destination=args.audio,
        )
        print(json.dumps({"video": str(video), "audio": str(audio)}, indent=2))
        return
    if args.command == "scan-shots":
        from starme.media_pipeline import probe_media
        from starme.shotscan import manifest_entries, scan, write_manifest
        from starme.shotscan import report as scan_report

        duration = probe_media(args.master).duration_seconds
        shots = scan(args.master, args.lead_portrait, duration=duration)
        print(scan_report(shots))
        entries = manifest_entries(
            shots, episode=args.episode, role_character=args.role, co_stars=args.co_stars
        )
        print(f"\n{len(entries)} designated windows for episode {args.episode}")
        if args.merge_into and args.merge_into.is_file():
            # Only this episode's entries are replaced; the others are content
            # data for episodes this scan says nothing about.
            existing = json.loads(args.merge_into.read_text())
            kept = [e for e in existing if int(e.get("episode", 0)) != args.episode]
            entries = entries + kept
            print(f"merged with {len(kept)} entries from other episodes")
        if args.out:
            write_manifest(entries, args.out)
            print(f"written to {args.out}")
        else:
            print(json.dumps(entries, indent=1))
        return

    if args.command == "quality":
        report = structural_quality_report(args.source, args.output)
        print(json.dumps(asdict(report), indent=2, sort_keys=True))
        if not report.passed:
            raise SystemExit(2)
        return
    if args.command == "render":
        if not args.confirm_billable:
            raise SystemExit("Refusing to create a task without --confirm-billable")
        result = execute_seedance_render(asdict(_load_spec(args.spec)))
        print(json.dumps(result, indent=2, sort_keys=True))
