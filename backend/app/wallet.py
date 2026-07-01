"""Wallet service. All Vox credit/debit operations live here."""
from __future__ import annotations
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from .models import AdminGrant, LedgerEntry, User, Wallet

_log = logging.getLogger("wallet")

# Ledger reason values. Keep in sync with any external analytics / dashboards.
REASON_TRIAL = "trial"
REASON_ADMIN_GRANT = "admin_grant"
REASON_ADMIN_ADJUST = "admin_adjust"
REASON_STT_CONSUMPTION = "stt_consumption"
REASON_TTS_CONSUMPTION = "tts_consumption"

# Vox pricing (10 Vox per minute = 0.167 Vox per second, rounded up).
STT_VOX_PER_MINUTE = 10
TTS_VOX_PER_CHAR = 0.1

# Free trial grant at signup. Per spec, does NOT expire.
FREE_TRIAL_VOX = 200


def get_or_create_wallet(db: Session, user_id: int) -> Wallet:
    """Fetch a wallet, creating an empty one if missing."""
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if wallet:
        return wallet
    wallet = Wallet(user_id=user_id, balance_vox=0)
    db.add(wallet)
    db.commit()
    db.refresh(wallet)
    return wallet


def get_balance(db: Session, user_id: int) -> int:
    return get_or_create_wallet(db, user_id).balance_vox


def _record_ledger(
    db: Session,
    wallet: Wallet,
    delta_vox: int,
    reason: str,
    balance_after: int,
    *,
    ref_table: Optional[str] = None,
    ref_id: Optional[int] = None,
    note: Optional[str] = None,
    request_id: Optional[str] = None,
) -> LedgerEntry:
    entry = LedgerEntry(
        user_id=wallet.user_id,
        delta_vox=delta_vox,
        reason=reason,
        ref_table=ref_table,
        ref_id=ref_id,
        note=note,
        balance_after=balance_after,
        request_id=request_id,
    )
    db.add(entry)
    return entry


def _settle_wallet(wallet: Wallet, delta_vox: int) -> int:
    new_balance = wallet.balance_vox + delta_vox
    if new_balance < 0:
        raise ValueError(f"wallet would go negative: {wallet.balance_vox} + {delta_vox}")
    wallet.balance_vox = new_balance
    wallet.updated_at = datetime.utcnow()
    if delta_vox > 0:
        wallet.lifetime_vox_credited += delta_vox
    elif delta_vox < 0:
        wallet.lifetime_vox_consumed += -delta_vox
    return new_balance


def credit(
    db: Session,
    user_id: int,
    vox_amount: int,
    reason: str,
    *,
    note: Optional[str] = None,
    ref_table: Optional[str] = None,
    ref_id: Optional[int] = None,
    request_id: Optional[str] = None,
) -> LedgerEntry:
    """Add Vox to a user's wallet. Writes a ledger entry, commits."""
    if vox_amount == 0:
        raise ValueError("vox_amount must be non-zero")
    wallet = get_or_create_wallet(db, user_id)
    balance_after = _settle_wallet(wallet, vox_amount)
    entry = _record_ledger(
        db, wallet, vox_amount, reason, balance_after,
        ref_table=ref_table, ref_id=ref_id, note=note, request_id=request_id,
    )
    db.commit()
    db.refresh(entry)
    _log.info(
        "wallet credit",
        extra={
            "user_id": user_id, "delta_vox": vox_amount,
            "reason": reason, "balance_after": balance_after,
            "ref_table": ref_table, "ref_id": ref_id,
            "request_id": request_id,
        },
    )
    return entry


def debit(
    db: Session,
    user_id: int,
    vox_amount: int,
    reason: str,
    *,
    ref_table: Optional[str] = None,
    ref_id: Optional[int] = None,
    request_id: Optional[str] = None,
) -> Optional[LedgerEntry]:
    """Subtract Vox from a user's wallet. Returns None when vox_amount is 0.

    Raises ValueError if it would push the balance negative.
    """
    if vox_amount == 0:
        return None
    return credit(
        db, user_id, -vox_amount, reason,
        ref_table=ref_table, ref_id=ref_id, request_id=request_id,
    )


def grant_trial(db: Session, user: User, request_id: Optional[str] = None) -> LedgerEntry:
    """Credit the free trial to a freshly-registered user."""
    return credit(
        db, user.id, FREE_TRIAL_VOX, REASON_TRIAL,
        note="Free trial grant on signup",
        ref_table="users", ref_id=user.id,
        request_id=request_id,
    )


def admin_grant(
    db: Session,
    admin_user: User,
    target_user: User,
    vox_amount: int,
    note: Optional[str],
    request_id: Optional[str] = None,
) -> AdminGrant:
    """Record an admin grant and credit the target wallet. Returns the AdminGrant row."""
    if vox_amount <= 0:
        raise ValueError("vox_amount must be positive for an admin grant")
    grant = AdminGrant(
        admin_user_id=admin_user.id,
        target_user_id=target_user.id,
        vox_amount=vox_amount,
        note=note,
        request_id=request_id,
    )
    db.add(grant)
    db.flush()  # need grant.id for the ledger entry

    credit(
        db, target_user.id, vox_amount, REASON_ADMIN_GRANT,
        note=note,
        ref_table="admin_grants", ref_id=grant.id,
        request_id=request_id,
    )
    db.commit()
    db.refresh(grant)
    _log.info(
        "admin grant",
        extra={
            "admin_user_id": admin_user.id,
            "admin_email": admin_user.email,
            "target_user_id": target_user.id,
            "target_email": target_user.email,
            "vox_amount": vox_amount,
            "grant_id": grant.id,
            "request_id": request_id,
        },
    )
    return grant


def estimate_stt_vox(audio_bytes: int) -> int:
    """Conservative upper-bound Vox estimate for STT pre-check.

    Assumes worst-case ~16 kbps audio (high-bitrate webm). 16 kbps = 2 kB/s,
    so seconds <= bytes / 1500 (rounding up). 10 Vox per minute = 1 Vox / 6s,
    so vox <= ceil(seconds / 6). We round every estimate UP.
    """
    if audio_bytes <= 0:
        return 1
    est_seconds = max(1, -(-audio_bytes // 1500))  # ceil
    est_vox = max(1, -(-est_seconds // 6))  # ceil
    return est_vox


def compute_stt_vox(audio_seconds: float) -> int:
    """Final Vox charge for a successful STT call. Round up to next Vox."""
    if audio_seconds <= 0:
        return 1
    minutes = audio_seconds / 60.0
    vox = minutes * STT_VOX_PER_MINUTE
    return max(1, int(-(-vox // 1))) if False else max(1, int(vox) + (1 if vox != int(vox) else 0))


def compute_tts_vox(char_count: int) -> int:
    """Final Vox charge for a successful TTS call. Round up to next Vox."""
    if char_count <= 0:
        return 1
    vox = char_count * TTS_VOX_PER_CHAR
    return max(1, int(vox) + (1 if vox != int(vox) else 0))


def estimate_tts_vox(char_count: int) -> int:
    """Pre-check estimate for TTS."""
    if char_count <= 0:
        return 1
    vox = char_count * TTS_VOX_PER_CHAR
    return max(1, int(vox) + (1 if vox != int(vox) else 0))


class InsufficientVoxError(Exception):
    def __init__(self, *, balance: int, required: int, requested_vox: int):
        self.balance = balance
        self.required = required
        self.requested_vox = requested_vox
        super().__init__(
            f"Insufficient Vox: balance={balance} requested={requested_vox} required>={required}"
        )
