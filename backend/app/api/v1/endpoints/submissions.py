"""Compatibility wrapper for the authoritative backend submissions router.

The real endpoint implementation now lives in `apps/backend`. This module
keeps the older frontend backend import path working without duplicating the
submission logic or schema behavior.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType


_AUTHORITATIVE_BACKEND_ROOT = Path(__file__).resolve().parents[6] / "backend"
_AUTHORITATIVE_MODULE_PATH = (
    _AUTHORITATIVE_BACKEND_ROOT / "app" / "api" / "v1" / "endpoints" / "submissions.py"
)
_AUTHORITATIVE_MODULE_NAME = "_sm2_authoritative_submissions"
_authoritative_module: ModuleType | None = None


def _load_authoritative_module() -> ModuleType:
    global _authoritative_module

    if _authoritative_module is not None:
        return _authoritative_module

    if not _AUTHORITATIVE_MODULE_PATH.exists():
        raise ImportError(
            "Expected authoritative submissions endpoint at "
            f"{_AUTHORITATIVE_MODULE_PATH}"
        )

    spec = importlib.util.spec_from_file_location(
        _AUTHORITATIVE_MODULE_NAME,
        _AUTHORITATIVE_MODULE_PATH,
    )
    if spec is None or spec.loader is None:
        raise ImportError(
            f"Unable to load authoritative submissions endpoint from {_AUTHORITATIVE_MODULE_PATH}"
        )

    module = importlib.util.module_from_spec(spec)
    original_sys_path = list(sys.path)
    try:
        backend_root = str(_AUTHORITATIVE_BACKEND_ROOT)
        if backend_root not in sys.path:
            sys.path.insert(0, backend_root)
        sys.modules[_AUTHORITATIVE_MODULE_NAME] = module
        spec.loader.exec_module(module)
    finally:
        sys.path[:] = original_sys_path

    _authoritative_module = module
    return module


_authoritative = _load_authoritative_module()
router = _authoritative.router


def __getattr__(name: str):
    return getattr(_authoritative, name)


__all__ = ["router"]
