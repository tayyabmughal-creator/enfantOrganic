"""Photos attached to a review by a customer.

Anyone can submit a review, so every upload is treated as untrusted: it must
decode as a real image, is capped in size and pixel count, has its EXIF data
(location, device) dropped by re-encoding, and is stored under a random name.
"""
import uuid
from io import BytesIO

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps
from rest_framework.exceptions import ValidationError

MAX_PHOTOS = 4
MAX_PHOTO_BYTES = 6 * 1024 * 1024
MAX_PHOTO_PIXELS = 36_000_000
MAX_PHOTO_SIDE = 1600
ALLOWED_FORMATS = {"JPEG", "MPO", "PNG", "WEBP", "GIF"}


def _fail(message):
    raise ValidationError({"images": [message]})


def _prepare(upload):
    if upload.size > MAX_PHOTO_BYTES:
        _fail(f"'{upload.name}' is larger than {MAX_PHOTO_BYTES // (1024 * 1024)} MB.")
    try:
        probe = Image.open(upload)
        image_format = probe.format
        probe.verify()
        upload.seek(0)
        image = Image.open(upload)
        if image.width * image.height > MAX_PHOTO_PIXELS:
            _fail(f"'{upload.name}' is too large in pixels.")
        image.load()
    except ValidationError:
        raise
    except Exception:
        _fail(f"'{upload.name}' is not a valid image.")
    if image_format not in ALLOWED_FORMATS:
        _fail(f"'{upload.name}' must be a JPG, PNG, WebP or GIF image.")

    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.getchannel("A"))
        image = flat
    else:
        image = image.convert("RGB")
    image.thumbnail((MAX_PHOTO_SIDE, MAX_PHOTO_SIDE))
    buffer = BytesIO()
    image.save(buffer, format="WEBP", quality=82, method=4)
    return buffer.getvalue()


def store_review_photos(uploads):
    """Validate, re-encode and store the uploads; return their /media URLs."""
    uploads = list(uploads or [])
    if len(uploads) > MAX_PHOTOS:
        _fail(f"You can add up to {MAX_PHOTOS} photos.")

    # Check every file before writing any, so a bad third photo leaves nothing behind.
    encoded = [_prepare(upload) for upload in uploads]

    urls = []
    for data in encoded:
        path = default_storage.save(f"reviews/customer/{uuid.uuid4().hex}.webp", ContentFile(data))
        urls.append(f"{settings.MEDIA_URL.rstrip('/')}/{path}")
    return urls
