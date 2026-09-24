"""Normalise what shoppers type into storefront forms.

The storefront serves Oman, the UAE and Saudi Arabia in English and Arabic, so
the same field can arrive in several equivalent spellings:

- Arabic keyboards type Arabic-Indic digits (٠١٢٣…), Urdu/Persian keyboards
  type Extended Arabic-Indic digits (۰۱۲۳…), and some IMEs type full-width
  digits (０１２…). All of them mean 0–9.
- A number copied from the phone's contacts or WhatsApp is often wrapped in
  invisible bidi marks (U+202A…U+202C, U+2066…U+2069, LRM/RLM) and uses
  non-breaking spaces or non-ASCII dashes between groups.
- iOS "smart punctuation" turns a typed ' into ’ inside names.

Validators run on the normalised value, and the normalised value is what gets
stored, so SMS/WhatsApp/lookup code downstream only ever sees ASCII digits.
"""

import re
import unicodedata

# Zero-width and bidi control characters. ZWNJ/ZWJ (U+200C/U+200D) are left
# alone: they are meaningful inside Persian/Urdu names.
_INVISIBLE = re.compile("[\u00ad\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]")
_SPACES = re.compile(r"\s+")
_DASHES = str.maketrans({ch: "-" for ch in "\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d"})

PHONE_ALLOWED = re.compile(r"^\+?[0-9 ()\-.]+$")
PHONE_MIN_DIGITS = 8
PHONE_MAX_DIGITS = 15

# Punctuation that legitimately appears in names, in either script.
_NAME_PUNCTUATION = set(" '\u2019\u2018\u02bc`.-,\u060c()/&")

# Arabic letter variants that customers use interchangeably when typing a
# city or area name (hamza forms of alef, taa marbuta, alef maqsura).
_ARABIC_FOLD = str.maketrans({
    "\u0623": "\u0627",  # أ
    "\u0625": "\u0627",  # إ
    "\u0622": "\u0627",  # آ
    "\u0671": "\u0627",  # ٱ
    "\u0629": "\u0647",  # ة
    "\u0649": "\u064a",  # ى
    "\u0640": None,      # tatweel
})


def strip_invisible(value):
    return _INVISIBLE.sub("", str(value or ""))


def to_ascii_digits(value):
    """Map every Unicode decimal digit (Arabic-Indic, Persian, full-width...) to 0-9."""
    out = []
    for ch in str(value or ""):
        digit = unicodedata.decimal(ch, None)
        out.append(ch if digit is None else str(digit))
    return "".join(out)


def clean_text(value):
    """Drop invisible marks and collapse any run of whitespace (incl. NBSP) to one space."""
    return _SPACES.sub(" ", strip_invisible(value)).strip()


def normalize_phone(value):
    """Return the phone number with ASCII digits and ASCII separators only."""
    text = to_ascii_digits(clean_text(value))
    text = text.translate(_DASHES).replace("\uff0b", "+").replace("\uff08", "(").replace("\uff09", ")")
    return _SPACES.sub(" ", text).strip()


def phone_digit_count(value):
    return sum(1 for ch in str(value or "") if ch.isdigit())


def is_valid_phone(value):
    """Validate an already-normalised phone number."""
    return bool(PHONE_ALLOWED.match(value or "")) and (
        PHONE_MIN_DIGITS <= phone_digit_count(value) <= PHONE_MAX_DIGITS
    )


def normalize_name(value):
    return unicodedata.normalize("NFC", clean_text(value))


def is_valid_name(value):
    """Letters from any script, combining marks, digits and name punctuation."""
    if not any(ch.isalpha() for ch in value):
        return False
    for ch in value:
        if ch in _NAME_PUNCTUATION or ch in "\u200c\u200d":
            continue
        if unicodedata.category(ch)[0] not in {"L", "M", "N"}:
            return False
    return True


def normalize_code(value):
    """Coupon / gift card codes: full-width -> ASCII, any digits -> 0-9, no spaces, upper case."""
    text = to_ascii_digits(unicodedata.normalize("NFKC", strip_invisible(value)))
    return _SPACES.sub("", text).upper()


def normalize_email(value):
    return _SPACES.sub("", unicodedata.normalize("NFKC", strip_invisible(value)))


def location_key(value):
    """Comparison key for city/area names typed in English or Arabic."""
    text = to_ascii_digits(unicodedata.normalize("NFKC", clean_text(value)))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return text.translate(_ARABIC_FOLD).casefold()
