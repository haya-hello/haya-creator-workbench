import argparse
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Local Faster-Whisper ASR for talk captions.")
    parser.add_argument("--audio", required=True, help="Path to extracted wav audio.")
    parser.add_argument("--output", required=True, help="Path to write raw ASR JSON.")
    parser.add_argument("--model", default="small", help="Whisper model size or local model path.")
    parser.add_argument("--language", default="zh", help="Language code, or auto.")
    parser.add_argument("--device", default="auto", help="auto, cuda, cpu.")
    parser.add_argument("--compute-type", default="auto", help="auto, float16, int8_float16, int8.")
    return parser


def load_model(model_name: str, device: str, compute_type: str) -> WhisperModel:
    preferred_device = "cuda" if device == "auto" else device
    preferred_compute = "float16" if compute_type == "auto" and preferred_device == "cuda" else compute_type
    if preferred_compute == "auto":
        preferred_compute = "int8"

    try:
        return WhisperModel(model_name, device=preferred_device, compute_type=preferred_compute)
    except Exception as exc:
        print(
            f"[local-asr] Falling back to CPU int8 because {preferred_device}/{preferred_compute} failed: {exc}",
            file=sys.stderr,
        )
        return WhisperModel(model_name, device="cpu", compute_type="int8")


def collect_segments(model: WhisperModel, audio_path: Path, language: str | None):
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=True,
        word_timestamps=True,
        beam_size=5,
    )
    payload_segments = []
    for segment in segments:
        payload_segments.append(
            {
                "id": segment.id,
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "words": [
                    {
                        "start": word.start,
                        "end": word.end,
                        "word": word.word,
                        "probability": word.probability,
                    }
                    for word in (segment.words or [])
                ],
            }
        )
    return info, payload_segments


def main() -> int:
    args = build_parser().parse_args()
    audio_path = Path(args.audio)
    output_path = Path(args.output)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    language = None if args.language == "auto" else args.language
    model = load_model(args.model, args.device, args.compute_type)
    try:
        info, payload_segments = collect_segments(model, audio_path, language)
    except Exception as exc:
        if args.device != "auto":
            raise
        print(
            f"[local-asr] Transcription failed on auto device, retrying CPU int8: {exc}",
            file=sys.stderr,
        )
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        info, payload_segments = collect_segments(model, audio_path, language)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
                "segments": payload_segments,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
