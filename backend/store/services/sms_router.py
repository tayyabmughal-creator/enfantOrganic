import logging
import re
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class SMSProviderError(Exception):
    pass


class SMSProviderConfigError(SMSProviderError):
    pass


class SMSProviderSendError(SMSProviderError):
    pass


def _normalize_phone(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    cleaned = re.sub(r"[^\d+]", "", raw)
    if cleaned.startswith("00"):
        cleaned = f"+{cleaned[2:]}"
    if cleaned.startswith("+"):
        return f"+{cleaned[1:].lstrip('+')}"
    return cleaned


def _request_timeout():
    try:
        return int(getattr(settings, "SMS_REQUEST_TIMEOUT", 15))
    except (TypeError, ValueError):
        return 15


class BaseSMSProvider:
    key = ""
    required_settings = ()

    def missing_settings(self):
        return [name for name in self.required_settings if not getattr(settings, name, "")]

    def is_configured(self):
        return not self.missing_settings()

    def send(self, recipient, body, *, locale="en", metadata=None):
        raise NotImplementedError


class UnifonicSMSProvider(BaseSMSProvider):
    key = "unifonic"
    required_settings = ("UNIFONIC_APP_SID", "UNIFONIC_SENDER_ID")

    def send(self, recipient, body, *, locale="en", metadata=None):
        missing = self.missing_settings()
        if missing:
            raise SMSProviderConfigError(f"Missing Unifonic settings: {', '.join(missing)}")

        endpoint = str(
            getattr(
                settings,
                "UNIFONIC_BASE_URL",
                "https://el.cloud.unifonic.com/rest/SMS/messages",
            )
            or ""
        ).strip()
        if not endpoint:
            raise SMSProviderConfigError("UNIFONIC_BASE_URL is not configured.")

        payload = {
            "AppSid": str(getattr(settings, "UNIFONIC_APP_SID", "")).strip(),
            "SenderID": str(getattr(settings, "UNIFONIC_SENDER_ID", "")).strip(),
            "Recipient": recipient,
            "Body": body,
            "responseType": "json",
        }
        headers = {"Accept": "application/json"}
        auth_token = str(getattr(settings, "UNIFONIC_AUTH_TOKEN", "") or "").strip()
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        try:
            response = requests.post(
                endpoint,
                data=payload,
                headers=headers,
                timeout=_request_timeout(),
            )
        except requests.RequestException as exc:
            raise SMSProviderSendError(f"Unifonic request failed: {exc}") from exc

        if response.status_code >= 400:
            raise SMSProviderSendError(
                f"Unifonic rejected SMS with HTTP {response.status_code}: {response.text[:200]}"
            )

        data = {}
        try:
            data = response.json()
        except ValueError:
            data = {}

        success_flag = str(data.get("success") or data.get("Success") or "").strip().lower()
        if success_flag in {"false", "0", "no"}:
            error_message = (
                data.get("message")
                or data.get("Message")
                or data.get("error")
                or data.get("ErrorMessage")
                or "Unifonic returned unsuccessful status."
            )
            raise SMSProviderSendError(str(error_message))

        provider_message_id = str(
            data.get("message_id")
            or data.get("MessageID")
            or data.get("messageId")
            or ""
        ).strip()
        return {
            "success": True,
            "provider": self.key,
            "provider_message_id": provider_message_id,
            "status": "sent",
            "error": "",
        }


class TwilioSMSProvider(BaseSMSProvider):
    key = "twilio"
    required_settings = ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN")

    def send(self, recipient, body, *, locale="en", metadata=None):
        missing = self.missing_settings()
        if missing:
            raise SMSProviderConfigError(f"Missing Twilio settings: {', '.join(missing)}")

        account_sid = str(getattr(settings, "TWILIO_ACCOUNT_SID", "")).strip()
        auth_token = str(getattr(settings, "TWILIO_AUTH_TOKEN", "")).strip()
        from_number = str(getattr(settings, "TWILIO_FROM_NUMBER", "")).strip()
        messaging_service_sid = str(getattr(settings, "TWILIO_MESSAGING_SERVICE_SID", "")).strip()
        if not from_number and not messaging_service_sid:
            raise SMSProviderConfigError(
                "Twilio requires TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID."
            )

        base_url = str(
            getattr(settings, "TWILIO_BASE_URL", "https://api.twilio.com")
            or "https://api.twilio.com"
        ).rstrip("/")
        endpoint = f"{base_url}/2010-04-01/Accounts/{account_sid}/Messages.json"

        payload = {
            "To": recipient,
            "Body": body,
        }
        if messaging_service_sid:
            payload["MessagingServiceSid"] = messaging_service_sid
        else:
            payload["From"] = from_number

        try:
            response = requests.post(
                endpoint,
                data=payload,
                auth=(account_sid, auth_token),
                timeout=_request_timeout(),
            )
        except requests.RequestException as exc:
            raise SMSProviderSendError(f"Twilio request failed: {exc}") from exc

        if response.status_code >= 400:
            raise SMSProviderSendError(
                f"Twilio rejected SMS with HTTP {response.status_code}: {response.text[:200]}"
            )

        data = {}
        try:
            data = response.json()
        except ValueError:
            data = {}

        provider_message_id = str(data.get("sid") or "").strip()
        return {
            "success": True,
            "provider": self.key,
            "provider_message_id": provider_message_id,
            "status": "sent",
            "error": "",
        }


class MockSMSProvider(BaseSMSProvider):
    key = "mock"
    required_settings = ()

    def is_configured(self):
        return bool(getattr(settings, "SMS_ENABLE_MOCK", False))

    def send(self, recipient, body, *, locale="en", metadata=None):
        if not self.is_configured():
            raise SMSProviderConfigError("Mock SMS provider is disabled.")
        message_id = f"mock-{int(time.time() * 1000)}"
        return {
            "success": True,
            "provider": self.key,
            "provider_message_id": message_id,
            "status": "sent",
            "error": "",
        }


PROVIDER_REGISTRY = {
    "unifonic": UnifonicSMSProvider(),
    "twilio": TwilioSMSProvider(),
    "mock": MockSMSProvider(),
}


def _normalize_provider_key(value):
    return str(value or "").strip().lower()


def _is_ksa_phone(recipient):
    normalized = _normalize_phone(recipient)
    return normalized.startswith("+966") or normalized.startswith("966")


def _provider_candidates(recipient, preferred_provider=""):
    candidates = []
    if _is_ksa_phone(recipient):
        candidates.append("unifonic")

    default_provider = _normalize_provider_key(
        preferred_provider or getattr(settings, "SMS_DEFAULT_PROVIDER", "unifonic")
    )
    if default_provider:
        candidates.append(default_provider)

    candidates.append("twilio")
    if getattr(settings, "SMS_ENABLE_MOCK", False):
        candidates.append("mock")

    normalized = []
    seen = set()
    for key in candidates:
        if key not in PROVIDER_REGISTRY:
            continue
        if key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized


def send_sms(recipient, body, *, locale="en", preferred_provider="", metadata=None):
    normalized_recipient = _normalize_phone(recipient)
    message_body = str(body or "").strip()
    if not normalized_recipient:
        return {
            "success": False,
            "provider": "",
            "provider_message_id": "",
            "status": "skipped",
            "error": "Recipient phone is empty.",
            "attempted_providers": [],
        }
    if not message_body:
        return {
            "success": False,
            "provider": "",
            "provider_message_id": "",
            "status": "skipped",
            "error": "SMS body is empty.",
            "attempted_providers": [],
        }

    attempts = []
    candidates = _provider_candidates(normalized_recipient, preferred_provider)
    for provider_key in candidates:
        provider = PROVIDER_REGISTRY[provider_key]
        if not provider.is_configured():
            missing = provider.missing_settings()
            error_message = (
                f"Provider {provider_key} is not configured."
                if not missing
                else f"Provider {provider_key} missing settings: {', '.join(missing)}"
            )
            attempts.append(
                {
                    "provider": provider_key,
                    "status": "skipped",
                    "error": error_message,
                }
            )
            continue

        try:
            result = provider.send(
                normalized_recipient,
                message_body,
                locale=locale,
                metadata=metadata or {},
            )
            result["attempted_providers"] = [
                *attempts,
                {"provider": provider_key, "status": "sent", "error": ""},
            ]
            return result
        except SMSProviderConfigError as exc:
            attempts.append(
                {
                    "provider": provider_key,
                    "status": "skipped",
                    "error": str(exc),
                }
            )
        except SMSProviderSendError as exc:
            attempts.append(
                {
                    "provider": provider_key,
                    "status": "failed",
                    "error": str(exc),
                }
            )
        except Exception as exc:
            logger.exception("Unexpected SMS provider failure (%s)", provider_key)
            attempts.append(
                {
                    "provider": provider_key,
                    "status": "failed",
                    "error": str(exc),
                }
            )

    failure_status = "failed" if any(item["status"] == "failed" for item in attempts) else "skipped"
    failure_error = (
        attempts[-1]["error"]
        if attempts
        else "No SMS provider candidates are available for this request."
    )
    return {
        "success": False,
        "provider": attempts[-1]["provider"] if attempts else "",
        "provider_message_id": "",
        "status": failure_status,
        "error": failure_error,
        "attempted_providers": attempts,
    }
