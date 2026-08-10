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
