#!/usr/bin/env python
"""Local MetaTrader5 Python IPC diagnostic for GoTrader.

This script performs read-only connection checks only. It does not place
orders, inspect positions, mutate account state, or expose credentials.
"""

from __future__ import annotations

import os
import platform
import struct
import sys
from pathlib import Path
from typing import Any


def section(title: str) -> None:
    print(f"\n== {title} ==")


def bool_label(value: bool) -> str:
    return "yes" if value else "no"


def mask_account(value: Any) -> str:
    text = str(value or "")
    if len(text) <= 4:
        return "****" if text else "unavailable"
    return f"{'*' * (len(text) - 4)}{text[-4:]}"


def safe_namedtuple_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if hasattr(value, "_asdict"):
        return dict(value._asdict())
    if isinstance(value, dict):
        return value
    return {
        key: getattr(value, key)
        for key in dir(value)
        if not key.startswith("_") and not callable(getattr(value, key))
    }


def print_key_value(key: str, value: Any) -> None:
    print(f"{key}: {value}")


def recommendation_for(code: Any, message: str, env: dict[str, str | None], path_exists: bool) -> list[str]:
    code_text = str(code)
    message_lower = message.lower()
    recommendations: list[str] = []

    if code_text == "-10005" or "ipc timeout" in message_lower:
        recommendations.extend(
            [
                "IPC timeout usually means Python could not attach to the MT5 terminal in time.",
                "Open MetaTrader 5 Desktop manually, log in, and keep it running before starting the upstream server.",
                "Set MT5_PATH to the exact terminal64.exe path and rerun this diagnostic.",
                "Use a terminal installed for the same Windows user that runs Python.",
                "Close duplicate/stale MT5 terminals, then reopen the intended one.",
                "Verify LOGIN, PASSWORD, and SERVER match the broker account shown inside MT5.",
            ]
        )
    elif code_text in {"-6", "-10003"} or "authorization" in message_lower or "login" in message_lower:
        recommendations.extend(
            [
                "Verify LOGIN, PASSWORD, and SERVER. Do not use investor/password variants unless your broker supports them for this connection.",
                "Confirm the same credentials can log in from MetaTrader 5 Desktop first.",
            ]
        )
    elif code_text not in {"0", "None"}:
        recommendations.append("Check the MetaTrader5 last_error code/message above and rerun after fixing the reported condition.")

    if env.get("MT5_PATH") and not path_exists:
        recommendations.append("MT5_PATH is set but the file does not exist. Point it to terminal64.exe.")
    if not env.get("MT5_PATH"):
        recommendations.append("MT5_PATH is not set. Auto-detection may work, but setting the exact terminal64.exe path is safer.")
    if not all(env.get(name) for name in ("LOGIN", "PASSWORD", "SERVER")):
        recommendations.append("LOGIN, PASSWORD, and SERVER are not all set, so this diagnostic cannot test explicit mt5.login().")

    if not recommendations:
        recommendations.append("Connection checks look healthy. Start the upstream OpenAPI server, then GoTrader's safe read-only wrapper.")

    return recommendations


def main() -> int:
    section("Python")
    print_key_value("executable", sys.executable)
    print_key_value("version", sys.version.replace("\n", " "))
    print_key_value("platform", platform.platform())
    print_key_value("architecture", platform.architecture()[0])
    print_key_value("pointer_bits", struct.calcsize("P") * 8)

    section("Environment")
    env = {name: os.environ.get(name) for name in ("LOGIN", "PASSWORD", "SERVER", "MT5_PATH")}
    for name in ("LOGIN", "PASSWORD", "SERVER"):
        print_key_value(f"{name}_present", bool_label(bool(env[name])))
    mt5_path = env["MT5_PATH"]
    path_exists = bool(mt5_path and Path(mt5_path).exists())
    print_key_value("MT5_PATH_present", bool_label(bool(mt5_path)))
    print_key_value("MT5_PATH_exists", bool_label(path_exists))
    if mt5_path:
        print_key_value("MT5_PATH", mt5_path)

    section("MetaTrader5 Package")
    try:
        import MetaTrader5 as mt5  # type: ignore
    except Exception as exc:  # pragma: no cover - diagnostic script
        print_key_value("import_success", "no")
        print_key_value("import_error", exc)
        print("\nRecommendation: install the upstream dependency with `python -m pip install -e C:\\Users\\andre\\metatrader-mcp-server`.")
        return 2

    print_key_value("import_success", "yes")
    print_key_value("package_version", getattr(mt5, "__version__", "unknown"))

    section("Initialize")
    initialized = False
    try:
        if mt5_path:
            print_key_value("initialize_call", "mt5.initialize(path=MT5_PATH)")
            initialized = bool(mt5.initialize(path=mt5_path))
        else:
            print_key_value("initialize_call", "mt5.initialize()")
            initialized = bool(mt5.initialize())
    except Exception as exc:  # pragma: no cover - diagnostic script
        print_key_value("initialize_exception", exc)
        initialized = False

    init_error = mt5.last_error()
    print_key_value("initialize_success", bool_label(initialized))
    print_key_value("last_error", init_error)

    login_attempted = False
    login_success = False
    login_error = init_error
    if initialized and all(env.get(name) for name in ("LOGIN", "PASSWORD", "SERVER")):
        section("Login")
        login_attempted = True
        try:
            login_value = int(str(env["LOGIN"]))
            login_success = bool(mt5.login(login_value, password=str(env["PASSWORD"]), server=str(env["SERVER"])))
        except ValueError:
            print_key_value("login_success", "no")
            print_key_value("login_error", "LOGIN must be numeric for MetaTrader5.login().")
        except Exception as exc:  # pragma: no cover - diagnostic script
            print_key_value("login_exception", exc)
        login_error = mt5.last_error()
        print_key_value("login_attempted", bool_label(login_attempted))
        print_key_value("login_success", bool_label(login_success))
        print_key_value("last_error", login_error)
    else:
        section("Login")
        print_key_value("login_attempted", "no")
        print_key_value("reason", "initialize failed or LOGIN/PASSWORD/SERVER are not all present")

    section("Read-Only Terminal Checks")
    terminal_info = None
    account_info = None
    symbols_total = None
    if initialized:
        try:
            terminal_info = mt5.terminal_info()
        except Exception as exc:  # pragma: no cover - diagnostic script
            print_key_value("terminal_info_error", exc)

        try:
            account_info = mt5.account_info()
        except Exception as exc:  # pragma: no cover - diagnostic script
            print_key_value("account_info_error", exc)

        try:
            symbols_total = mt5.symbols_total()
        except Exception as exc:  # pragma: no cover - diagnostic script
            print_key_value("symbols_total_error", exc)

    terminal_data = safe_namedtuple_dict(terminal_info)
    account_data = safe_namedtuple_dict(account_info)
    print_key_value("terminal_info_available", bool_label(bool(terminal_data)))
    if terminal_data:
        for key in ("name", "company", "path", "data_path", "connected", "trade_allowed", "community_account"):
            if key in terminal_data:
                print_key_value(f"terminal_{key}", terminal_data[key])

    print_key_value("account_info_available", bool_label(bool(account_data)))
    if account_data:
        masked_account = mask_account(account_data.get("login"))
        print_key_value("account_login_masked", masked_account)
        for key in ("server", "currency", "leverage", "trade_mode"):
            if key in account_data:
                print_key_value(f"account_{key}", account_data[key])

    print_key_value("symbols_total", symbols_total if symbols_total is not None else "unavailable")

    section("Recommendation")
    final_error = login_error if login_attempted else init_error
    code = final_error[0] if isinstance(final_error, tuple) and final_error else None
    message = final_error[1] if isinstance(final_error, tuple) and len(final_error) > 1 else str(final_error)
    for item in recommendation_for(code, message, env, path_exists):
        print(f"- {item}")

    if initialized:
        mt5.shutdown()

    return 0 if initialized else 1


if __name__ == "__main__":
    raise SystemExit(main())
