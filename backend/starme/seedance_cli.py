from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

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


def main() -> None:
    args = _parser().parse_args()
    if args.command == "auth-check":
        try:
            with _settings_client() as client:
                client.retrieve(args.task_id)
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
