"""Stage 2 of the masked pipeline: have a language model tighten the prompt.

Seedance follows a precise instruction better than a generic one, and the base
prompt is assembled from templates. One chat call rewrites it around the actual
subject descriptions and the content-owner notes.

Two things make this safe rather than a liability. Seedance infers the task
type partly from the prompt wording, so a rewrite that loses the edit verbs or
the ``@Video 1`` reference can turn a face swap into a freshly generated video
- billed in full, and wrong. Both are checked, and anything doubtful falls back
to the base prompt rather than risking the spend. And the call is never fatal:
if the model is unreachable the render proceeds on the base prompt.
"""

from __future__ import annotations

import httpx

from starme.config import Settings

#: Verbs Seedance recognises as an edit instruction. Without one of these the
#: request can be classified as text-to-video and generate something new.
_EDIT_KEYWORDS = ("edit", "replace", "remove", "delete", "modify", "change", "add")

_SYSTEM = (
    "You rewrite prompts for a video face-replacement model. Return ONLY the "
    "rewritten prompt, with no preamble, no explanation and no markdown. Keep "
    "every constraint you are given, especially which person must change and "
    "which people must not. Keep the phrase '@Video 1' and the reference to "
    "'@Image 1'. Begin with an explicit edit instruction. Be specific and "
    "unambiguous; do not add requirements that were not given to you."
)


def refine_prompt(
    *,
    base_prompt: str,
    subject_video_desc: str,
    image_desc: str,
    extra_notes: str,
    settings: Settings,
) -> tuple[str, bool]:
    """Return (prompt, refined). ``refined`` is False when the base was kept."""
    if settings.byteplus_api_key is None:
        return base_prompt, False
    detail = f"- <Subject 1> in the video: {subject_video_desc}\n"
    detail += f"  <Image 1> contains the face to apply: {image_desc or '(unspecified)'}\n"
    user = (
        "Rewrite the following face-replacement prompt so the video model "
        "follows it exactly.\n\n"
        f"People being swapped (1):\n{detail}\n"
        f"Base prompt to improve:\n{base_prompt}\n"
    )
    if extra_notes:
        user += f"\nAdditional requirements that must survive the rewrite: {extra_notes}\n"
    try:
        response = httpx.post(
            f"{settings.byteplus_api_base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.byteplus_api_key.get_secret_value()}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.byteplus_prompt_llm,
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": user},
                ],
                "max_tokens": 1200,
            },
            timeout=120,
        )
        response.raise_for_status()
        text = str(
            response.json()["choices"][0]["message"]["content"] or ""
        ).strip()
    except Exception:  # noqa: BLE001 - never fail a render over the prompt step
        return base_prompt, False

    if not text:
        return base_prompt, False
    if "@video" not in text.lower():
        # Without the positional reference the model does not know which input
        # it is editing; the base prompt is worth more than a shorter one.
        return base_prompt, False
    if not any(word in text.lower() for word in _EDIT_KEYWORDS):
        text = f"Strictly edit @Video 1: {text}"
    return text, True
