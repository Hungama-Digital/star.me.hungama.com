import pytest

from starme.providers import (
    DisabledObjectStorage,
    DisabledProviderError,
    DisabledRenderProvider,
    RenderRequest,
)


def test_disabled_storage_fails_closed() -> None:
    with pytest.raises(DisabledProviderError):
        DisabledObjectStorage().put("test", b"synthetic", "text/plain")


def test_disabled_renderer_fails_closed() -> None:
    request = RenderRequest("job", "shell", "role", "input")
    with pytest.raises(DisabledProviderError):
        DisabledRenderProvider().submit(request)
