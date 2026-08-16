"""Creating a region from the admin panel.

The Regions screen could only edit the three markets that already existed —
"there is no option to add additional regions". The endpoint accepted a POST
all along; these pin down the payload the new form sends.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from store.models import Region, SiteSettings
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles

User = get_user_model()


class AdminRegionCreateTests(TestCase):
    def setUp(self):
        ensure_default_admin_roles()
        self.api_client = APIClient()
        self.staff_user = User.objects.create_user(
            username="manager", password="Pass12345!", is_staff=True
        )
        self.staff_user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.api_client.force_authenticate(self.staff_user)

        Region.objects.create(
            code="om", name_en="Oman", name_ar="عمان", currency_code="OMR",
            fx_rate=Decimal("1.000000"), is_active=True, is_default=True,
            shipping_fee=Decimal("2.00"), shipping_threshold=Decimal("0.00"),
            contact_phone="12345678", address_en="Muscat", address_ar="مسقط",
        )

    def _payload(self, **overrides):
        # Exactly the shape NewRegionForm posts.
        payload = {
            "code": "kw",
            "currency_code": "KWD",
            "name_en": "Kuwait",
            "name_ar": "الكويت",
            "fx_rate": "0.118",
            "shipping_fee": "2.00",
            "shipping_threshold": "0",
            "contact_phone": "+965 5000 0000",
            "contact_email": "contact@enfant-me.com",
            "whatsapp_phone": "+965 5000 0000",
            "address_en": "Kuwait City",
            "address_ar": "مدينة الكويت",
            "locale_code": "en",
            "is_active": True,
        }
        payload.update(overrides)
        return payload

    def test_a_new_region_is_created(self):
        response = self.api_client.post("/api/admin/regions/", self._payload(), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        region = Region.objects.get(code="kw")
        self.assertEqual(region.name_ar, "الكويت")
        self.assertEqual(region.currency_code, "KWD")
        self.assertEqual(region.fx_rate, Decimal("0.118000"))
        self.assertTrue(region.is_active)

    def test_the_new_region_does_not_steal_the_default_flag(self):
        self.api_client.post("/api/admin/regions/", self._payload(), format="json")

        self.assertFalse(Region.objects.get(code="kw").is_default)
        self.assertTrue(Region.objects.get(code="om").is_default)

    def test_a_duplicate_code_is_rejected(self):
        response = self.api_client.post(
            "/api/admin/regions/", self._payload(code="om"), format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Region.objects.filter(code="om").count(), 1)

    def test_the_new_region_is_served_to_the_storefront(self):
        # /api/navigation/ dereferences the settings row without a null check.
        SiteSettings.objects.create()
        self.api_client.post("/api/admin/regions/", self._payload(), format="json")

        response = APIClient().get("/api/navigation/?locale=en&region=kw")

        self.assertEqual(response.status_code, 200)
        codes = [row["code"] for row in response.data["regions"]]
        self.assertIn("kw", codes)

    def test_an_anonymous_caller_cannot_create_a_region(self):
        response = APIClient().post("/api/admin/regions/", self._payload(), format="json")

        self.assertIn(response.status_code, (401, 403))
        self.assertFalse(Region.objects.filter(code="kw").exists())
