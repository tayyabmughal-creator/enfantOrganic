from django.core.management.base import BaseCommand
from django.db import transaction

from store.models import Category, Product, ProductPrice, Region, Tag
from store.sample_data import ENFANT_ASSETS


CATEGORY_COMPLETIONS = {
    "bath-body": {
        "name_en": "Bath & Body",
        "name_ar": "الاستحمام والجسم",
        "description_en": "Gentle wash-day care for soft, sensitive baby skin.",
        "description_ar": "عناية لطيفة بيوم الاستحمام لبشرة الطفل الحساسة والناعمة.",
        "image": ENFANT_ASSETS["moisture_shampoo"],
    },
    "bedding": {
        "name_en": "Bedtime Care",
        "name_ar": "عناية وقت النوم",
        "description_en": "Soft evening essentials for calm nursery routines.",
        "description_ar": "أساسيات مسائية ناعمة لروتين حضانة أكثر هدوءًا.",
        "image": ENFANT_ASSETS["relax"],
    },
    "wardrobe": {
        "name_en": "Daily Essentials",
        "name_ar": "الأساسيات اليومية",
        "description_en": "Everyday organic care picks for clean family routines.",
        "description_ar": "مختارات عناية عضوية يومية لروتين عائلي نظيف.",
        "image": ENFANT_ASSETS["extra_mild"],
    },
    "feeding": {
        "name_en": "On-the-Go Care",
        "name_ar": "عناية أثناء التنقل",
        "description_en": "Portable care helpers for feeding, travel, and quick cleanups.",
        "description_ar": "مساعدات عناية محمولة للرضاعة والتنقل والتنظيف السريع.",
        "image": ENFANT_ASSETS["wipes"],
    },
}

TAG_COMPLETIONS = {
    "organic-cotton": {"name_en": "Organic Cotton", "name_ar": "قطن عضوي"},
    "neutral-palette": {"name_en": "Gentle Formula", "name_ar": "تركيبة لطيفة"},
    "limited-drop": {"name_en": "Limited Drop", "name_ar": "إصدار محدود"},
}

PRODUCT_COMPLETIONS = {
    "serene-knit-organic-blanket": {
        "name_en": "ENFANT Relax Moisturizing Bedtime Lotion",
        "name_ar": "لوشن إنفانت المرطب المهدئ لوقت النوم",
        "unit": "250 ml",
        "short_description_en": "Calming bedtime moisture for delicate baby skin and peaceful evening routines.",
        "short_description_ar": "ترطيب مهدئ لوقت النوم لبشرة الطفل الحساسة وروتين مسائي هادئ.",
        "description_en": "A soft, comforting lotion designed for evening care, helping delicate baby skin feel nourished after bath time.",
        "description_ar": "لوشن ناعم ومريح مصمم للعناية المسائية ليساعد بشرة الطفل الحساسة على الشعور بالتغذية بعد الاستحمام.",
        "details_en": ["Bedtime moisture ritual", "Soft non-sticky finish", "Made for delicate baby skin"],
        "details_ar": ["روتين ترطيب مسائي", "ملمس ناعم غير لزج", "مناسب لبشرة الطفل الحساسة"],
        "reviews_en": [{"name": "Maha", "copy": "Lovely for our night routine and gentle enough for daily use."}],
        "reviews_ar": [{"name": "مها", "copy": "رائع لروتين الليل ولطيف بما يكفي للاستخدام اليومي."}],
        "ingredients_en": "Organic chamomile extract, shea butter, argan oil, gentle moisturizing base.",
        "ingredients_ar": "مستخلص البابونج العضوي، زبدة الشيا، زيت الأرجان، قاعدة ترطيب لطيفة.",
        "usage_instructions_en": "Massage gently onto clean, dry skin after bath time or before bedtime.",
        "usage_instructions_ar": "يدلك بلطف على بشرة نظيفة وجافة بعد الاستحمام أو قبل النوم.",
        "origin_source_en": "Dermatologically tested care inspired by German baby skincare standards.",
        "origin_source_ar": "عناية مختبرة جلدياً مستوحاة من معايير عناية الأطفال الألمانية.",
        "organic_certification_name": "Enfant Organic Care Standard",
        "dietary_tags": ["organic", "sensitive-skin"],
        "shelf_life": "24 months unopened",
        "badge_en": "Bedtime Care",
        "badge_ar": "عناية مسائية",
        "review_count": 31,
        "rating": "4.8",
        "image": ENFANT_ASSETS["relax"],
        "hover_image": ENFANT_ASSETS["double_moisture"],
        "gallery": [ENFANT_ASSETS["relax"], ENFANT_ASSETS["double_moisture"], ENFANT_ASSETS["extra_mild"]],
        "option_groups_en": [{"name": "Size", "values": ["250 ml"]}],
        "option_groups_ar": [{"name": "الحجم", "values": ["250 مل"]}],
        "show_in_new_arrivals": True,
        "show_in_top_choices": True,
        "stock_quantity": 84,
        "prices": {
            "om": {"price": "5.20", "compare_at_price": "6.20"},
            "ae": {"price": "50.00", "compare_at_price": "59.00"},
            "sa": {"price": "52.00", "compare_at_price": "61.00"},
        },
    },
    "cloud-wash-duo": {
        "name_en": "ENFANT Cloud Wash Duo",
        "name_ar": "مجموعة إنفانت كلاود ووش الثنائية",
        "unit": "2 piece set",
        "short_description_en": "Gentle wash-day pairing for soft bath routines and sensitive baby skin.",
        "short_description_ar": "ثنائي لطيف ليوم الاستحمام وروتين نظافة ناعم لبشرة الطفل الحساسة.",
        "description_en": "A bath-time duo made for daily cleansing and moisture balance without leaving baby skin feeling tight.",
        "description_ar": "ثنائي وقت الاستحمام للتنظيف اليومي وتوازن الترطيب دون ترك بشرة الطفل مشدودة.",
        "details_en": ["Gentle daily cleanse", "Moisture-balanced formula", "Gift-ready bath set"],
        "details_ar": ["تنظيف يومي لطيف", "تركيبة متوازنة الترطيب", "مجموعة استحمام مناسبة للهدايا"],
        "reviews_en": [{"name": "Aisha", "copy": "The duo feels premium and works beautifully for sensitive skin."}],
        "reviews_ar": [{"name": "عائشة", "copy": "المجموعة تبدو فاخرة وتناسب البشرة الحساسة بشكل جميل."}],
        "ingredients_en": "Mild cleansing agents, organic aloe, chamomile extract, soft moisture complex.",
        "ingredients_ar": "منظفات لطيفة، ألوفيرا عضوية، مستخلص البابونج، مركب ترطيب ناعم.",
        "usage_instructions_en": "Apply during bath time, lather gently, and rinse well. Follow with lotion if needed.",
        "usage_instructions_ar": "يستخدم أثناء الاستحمام، يرغى بلطف ثم يشطف جيداً. يتبع بلوشن عند الحاجة.",
        "origin_source_en": "Dermatologically tested care inspired by German baby skincare standards.",
        "origin_source_ar": "عناية مختبرة جلدياً مستوحاة من معايير عناية الأطفال الألمانية.",
        "organic_certification_name": "Enfant Organic Care Standard",
        "dietary_tags": ["organic", "sensitive-skin"],
        "shelf_life": "24 months unopened",
        "badge_en": "Bath Duo",
        "badge_ar": "ثنائي الاستحمام",
        "review_count": 44,
        "rating": "4.9",
        "image": ENFANT_ASSETS["moisture_shampoo"],
        "hover_image": ENFANT_ASSETS["extra_mild"],
        "gallery": [ENFANT_ASSETS["moisture_shampoo"], ENFANT_ASSETS["extra_mild"], ENFANT_ASSETS["wipes"]],
        "option_groups_en": [{"name": "Set", "values": ["Wash + Lotion"]}],
        "option_groups_ar": [{"name": "المجموعة", "values": ["غسول + لوشن"]}],
        "show_in_baby_sets": True,
        "show_in_top_choices": True,
        "stock_quantity": 67,
        "prices": {
            "om": {"price": "8.50", "compare_at_price": "10.00"},
            "ae": {"price": "82.00", "compare_at_price": "96.00"},
            "sa": {"price": "84.00", "compare_at_price": "98.00"},
        },
    },
    "golden-hour-sleepsuit": {
        "name_en": "ENFANT Golden Hour Daily Care Set",
        "name_ar": "مجموعة إنفانت جولدن آور للعناية اليومية",
        "unit": "3 piece set",
        "short_description_en": "A simple daily care edit for moisture, comfort, and gentle family routines.",
        "short_description_ar": "مجموعة عناية يومية بسيطة للترطيب والراحة وروتين العائلة اللطيف.",
        "description_en": "A curated everyday set for parents who want clean, soft, and reliable Enfant care in one routine.",
        "description_ar": "مجموعة يومية مختارة للآباء الذين يريدون عناية إنفانت نظيفة وناعمة وموثوقة في روتين واحد.",
        "details_en": ["Daily moisture support", "Family-friendly routine", "Premium giftable edit"],
        "details_ar": ["دعم الترطيب اليومي", "روتين مناسب للعائلة", "مجموعة فاخرة مناسبة للهدايا"],
        "reviews_en": [{"name": "Layla", "copy": "A complete little routine and very easy to gift."}],
        "reviews_ar": [{"name": "ليلى", "copy": "روتين صغير متكامل وسهل جداً كهدية."}],
        "ingredients_en": "Organic chamomile, argan oil, gentle cleansing base, skin comfort moisturizers.",
        "ingredients_ar": "بابونج عضوي، زيت الأرجان، قاعدة تنظيف لطيفة، مرطبات مريحة للبشرة.",
        "usage_instructions_en": "Use as a daily care routine after bath time and before outings.",
        "usage_instructions_ar": "يستخدم كروتين عناية يومي بعد الاستحمام وقبل الخروج.",
        "origin_source_en": "Dermatologically tested care inspired by German baby skincare standards.",
        "origin_source_ar": "عناية مختبرة جلدياً مستوحاة من معايير عناية الأطفال الألمانية.",
        "organic_certification_name": "Enfant Organic Care Standard",
        "dietary_tags": ["organic", "sensitive-skin"],
        "shelf_life": "24 months unopened",
        "badge_en": "Daily Set",
        "badge_ar": "مجموعة يومية",
        "review_count": 28,
        "rating": "4.7",
        "image": ENFANT_ASSETS["extra_mild"],
        "hover_image": ENFANT_ASSETS["daily_sun"],
        "gallery": [ENFANT_ASSETS["extra_mild"], ENFANT_ASSETS["daily_sun"], ENFANT_ASSETS["double_moisture"]],
        "option_groups_en": [{"name": "Set", "values": ["Daily Trio"]}],
        "option_groups_ar": [{"name": "المجموعة", "values": ["ثلاثي يومي"]}],
        "show_in_new_arrivals": True,
        "stock_quantity": 72,
        "prices": {
            "om": {"price": "7.80", "compare_at_price": "9.20"},
            "ae": {"price": "75.00", "compare_at_price": "88.00"},
            "sa": {"price": "77.00", "compare_at_price": "90.00"},
        },
    },
    "feeding-chair-muslin-wrap": {
        "name_en": "ENFANT On-the-Go Wipes & Care Wrap",
        "name_ar": "مجموعة إنفانت للعناية والتنظيف أثناء التنقل",
        "unit": "travel pack",
        "short_description_en": "Portable gentle cleanups for feeding, travel, and everyday family moments.",
        "short_description_ar": "تنظيف لطيف ومحمول للرضاعة والتنقل ولحظات العائلة اليومية.",
        "description_en": "A compact care helper made for quick cleanups and comfort when families are out and about.",
        "description_ar": "مساعد عناية عملي للتنظيف السريع والراحة عندما تكون العائلة خارج المنزل.",
        "details_en": ["Travel-friendly care", "Soft cleanups for face and body", "Useful for feeding time"],
        "details_ar": ["عناية مناسبة للسفر", "تنظيف ناعم للوجه والجسم", "مفيد لوقت الرضاعة"],
        "reviews_en": [{"name": "Noor", "copy": "Perfect to keep in the stroller bag."}],
        "reviews_ar": [{"name": "نور", "copy": "مثالي لوضعه في حقيبة العربة."}],
        "ingredients_en": "Soft wipes base, organic aloe, purified water, gentle skin comfort ingredients.",
        "ingredients_ar": "قاعدة مناديل ناعمة، ألوفيرا عضوية، ماء منقى، مكونات لطيفة لراحة البشرة.",
        "usage_instructions_en": "Use for quick face, hand, and body cleanups. Close pack tightly after use.",
        "usage_instructions_ar": "يستخدم لتنظيف الوجه واليدين والجسم بسرعة. يغلق العبوة جيداً بعد الاستخدام.",
        "origin_source_en": "Dermatologically tested care inspired by German baby skincare standards.",
        "origin_source_ar": "عناية مختبرة جلدياً مستوحاة من معايير عناية الأطفال الألمانية.",
        "organic_certification_name": "Enfant Organic Care Standard",
        "dietary_tags": ["organic", "sensitive-skin"],
        "shelf_life": "18 months unopened",
        "badge_en": "Travel Care",
        "badge_ar": "عناية متنقلة",
        "review_count": 22,
        "rating": "4.8",
        "image": ENFANT_ASSETS["wipes"],
        "hover_image": ENFANT_ASSETS["complete_care"],
        "gallery": [ENFANT_ASSETS["wipes"], ENFANT_ASSETS["complete_care"], ENFANT_ASSETS["extra_mild"]],
        "option_groups_en": [{"name": "Pack", "values": ["Single", "3 Pack"]}],
        "option_groups_ar": [{"name": "العبوة", "values": ["عبوة واحدة", "3 عبوات"]}],
        "show_in_top_choices": True,
        "stock_quantity": 110,
        "prices": {
            "om": {"price": "4.20", "compare_at_price": "5.20"},
            "ae": {"price": "40.00", "compare_at_price": "49.00"},
            "sa": {"price": "42.00", "compare_at_price": "51.00"},
        },
    },
    "nursery-light-quilt": {
        "name_en": "ENFANT Light Nursery Comfort Cream",
        "name_ar": "كريم إنفانت الخفيف لراحة الحضانة",
        "unit": "100 ml",
        "short_description_en": "A soothing comfort cream for dry patches, diaper areas, and daily nursery care.",
        "short_description_ar": "كريم مهدئ للبقع الجافة ومناطق الحفاض والعناية اليومية في الحضانة.",
        "description_en": "A nourishing cream with a soft protective feel, made for fragile skin barriers and everyday comfort.",
        "description_ar": "كريم مغذٍ بملمس واقٍ ناعم، مصمم لحاجز البشرة الحساس والراحة اليومية.",
        "details_en": ["Soothes dry patches", "Comfort for diaper areas", "Soft protective finish"],
        "details_ar": ["يهدئ مناطق الجفاف", "راحة لمناطق الحفاض", "ملمس واقٍ ناعم"],
        "reviews_en": [{"name": "Huda", "copy": "Soft, calming, and easy to apply."}],
        "reviews_ar": [{"name": "هدى", "copy": "ناعم ومهدئ وسهل الاستخدام."}],
        "ingredients_en": "Shea butter, organic chamomile, zinc comfort complex, gentle moisturizer base.",
        "ingredients_ar": "زبدة الشيا، بابونج عضوي، مركب زنك مريح، قاعدة ترطيب لطيفة.",
        "usage_instructions_en": "Apply a thin layer to clean, dry skin whenever comfort support is needed.",
        "usage_instructions_ar": "توضع طبقة رقيقة على بشرة نظيفة وجافة عند الحاجة للدعم والراحة.",
        "origin_source_en": "Dermatologically tested care inspired by German baby skincare standards.",
        "origin_source_ar": "عناية مختبرة جلدياً مستوحاة من معايير عناية الأطفال الألمانية.",
        "organic_certification_name": "Enfant Organic Care Standard",
        "dietary_tags": ["organic", "sensitive-skin"],
        "shelf_life": "24 months unopened",
        "badge_en": "Comfort Cream",
        "badge_ar": "كريم مريح",
        "review_count": 35,
        "rating": "4.9",
        "image": ENFANT_ASSETS["complete_care"],
        "hover_image": ENFANT_ASSETS["relax"],
        "gallery": [ENFANT_ASSETS["complete_care"], ENFANT_ASSETS["relax"], ENFANT_ASSETS["double_moisture"]],
        "option_groups_en": [{"name": "Size", "values": ["100 ml"]}],
        "option_groups_ar": [{"name": "الحجم", "values": ["100 مل"]}],
        "show_in_baby_sets": True,
        "show_in_top_choices": True,
        "stock_quantity": 59,
        "prices": {
            "om": {"price": "6.40", "compare_at_price": "7.80"},
            "ae": {"price": "61.00", "compare_at_price": "74.00"},
            "sa": {"price": "63.00", "compare_at_price": "76.00"},
        },
    },
    "cotton-ritual-basket": {
        "name_en": "ENFANT Cotton Ritual Gift Basket",
        "name_ar": "سلة إنفانت القطنية للعناية والهدايا",
        "unit": "gift basket",
        "short_description_en": "Gift-ready care basket for lotions, wipes, creams, and daily baby essentials.",
        "short_description_ar": "سلة عناية مناسبة للهدايا تضم اللوشن والمناديل والكريمات وأساسيات الطفل اليومية.",
        "description_en": "A premium basket-style care edit for organizing Enfant essentials at home or gifting a new parent.",
        "description_ar": "مجموعة عناية فاخرة على شكل سلة لتنظيم أساسيات إنفانت في المنزل أو إهدائها للوالدين الجدد.",
        "details_en": ["Gift-ready care edit", "Includes daily routine essentials", "Soft organic family theme"],
        "details_ar": ["مجموعة عناية جاهزة للهدايا", "تضم أساسيات الروتين اليومي", "طابع عضوي ناعم للعائلة"],
        "reviews_en": [{"name": "Reem", "copy": "Beautiful for gifting and practical for daily use."}],
        "reviews_ar": [{"name": "ريم", "copy": "جميلة للهدايا وعملية للاستخدام اليومي."}],
        "ingredients_en": "A curated set of Enfant daily care essentials with organic comfort ingredients.",
        "ingredients_ar": "مجموعة مختارة من أساسيات إنفانت اليومية بمكونات عضوية مريحة.",
        "usage_instructions_en": "Use each item as directed. Store products in a cool, dry place after opening.",
        "usage_instructions_ar": "يستخدم كل منتج حسب التعليمات. تحفظ المنتجات في مكان بارد وجاف بعد الفتح.",
        "origin_source_en": "Dermatologically tested care inspired by German baby skincare standards.",
        "origin_source_ar": "عناية مختبرة جلدياً مستوحاة من معايير عناية الأطفال الألمانية.",
        "organic_certification_name": "Enfant Organic Care Standard",
        "dietary_tags": ["organic", "sensitive-skin"],
        "shelf_life": "24 months unopened",
        "badge_en": "Giftable",
        "badge_ar": "مناسب للهدايا",
        "review_count": 18,
        "rating": "4.7",
        "image": ENFANT_ASSETS["double_moisture"],
        "hover_image": ENFANT_ASSETS["wipes"],
        "gallery": [ENFANT_ASSETS["double_moisture"], ENFANT_ASSETS["wipes"], ENFANT_ASSETS["complete_care"]],
        "option_groups_en": [{"name": "Set", "values": ["Gift Basket"]}],
        "option_groups_ar": [{"name": "المجموعة", "values": ["سلة هدايا"]}],
        "show_in_baby_sets": True,
        "stock_quantity": 43,
        "prices": {
            "om": {"price": "10.50", "compare_at_price": "12.90"},
            "ae": {"price": "100.00", "compare_at_price": "122.00"},
            "sa": {"price": "103.00", "compare_at_price": "126.00"},
        },
    },
}

PRICE_DEFAULTS = {
    "price_prefix_en": "",
    "price_prefix_ar": "",
    "unit_price_text_en": "",
    "unit_price_text_ar": "",
}

UNIT_COMPLETIONS = {
    "sweet-dreams-baby-powder": "250 ml",
    "extra-mild-moisture-lotion": "250 ml",
    "natural-mosquito-repellent-spray": "100 ml",
    "organic-kids-toothpaste": "70 ml",
    "extra-mild-baby-wipes": "60 wipes",
    "newborn-gift-set-sweet-dream": "gift set",
    "ultimate-organic-newborn-essential-kit": "full kit",
    "sweet-dream-foam-mousse-400ml": "300 ml",
    "shea-butter-nurturing-baby-balm": "30 ml",
}

COMMON_PRODUCT_DEFAULTS = {
    "ingredients_en": "Organic chamomile extract, argan oil, shea butter, purified water, and a gentle baby-safe moisturizing base.",
    "ingredients_ar": "مستخلص البابونج العضوي، زيت الأرجان، زبدة الشيا، ماء منقى، وقاعدة ترطيب لطيفة وآمنة للأطفال.",
    "usage_instructions_en": "Apply gently as part of the daily care routine. Avoid direct contact with eyes and keep out of reach of children.",
    "usage_instructions_ar": "يستخدم بلطف ضمن روتين العناية اليومي. تجنب ملامسة العينين مباشرة ويحفظ بعيداً عن متناول الأطفال.",
    "origin_source_en": "Dermatologically tested care inspired by German baby skincare standards.",
    "origin_source_ar": "عناية مختبرة جلدياً مستوحاة من معايير عناية الأطفال الألمانية.",
    "organic_certification_name": "Enfant Organic Care Standard",
    "shelf_life": "24 months unopened",
}

COMMON_DIETARY_TAGS = ["organic", "sensitive-skin", "non-gmo"]


class Command(BaseCommand):
    help = "Complete legacy demo catalog rows with display data and regional prices."

    @transaction.atomic
    def handle(self, *args, **options):
        updated_categories = 0
        updated_tags = 0
        updated_products = 0
        updated_prices = 0
        regions = {region.code: region for region in Region.objects.all()}

        for slug, payload in CATEGORY_COMPLETIONS.items():
            updated = Category.objects.filter(slug=slug).update(**payload)
            updated_categories += updated

        for slug, payload in TAG_COMPLETIONS.items():
            updated = Tag.objects.filter(slug=slug).update(**payload)
            updated_tags += updated

        for slug, payload in PRODUCT_COMPLETIONS.items():
            product = Product.objects.filter(slug=slug).first()
            if not product:
                self.stdout.write(self.style.WARNING(f"Skipped missing product: {slug}"))
                continue

            product_payload = payload.copy()
            prices = product_payload.pop("prices")
            for field, value in product_payload.items():
                setattr(product, field, value)
            product.vendor_en = "ENFANT ORGANICS"
            product.vendor_ar = "إنفانت أورجانيكس"
            product.brand = "Enfant"
            product.is_published = True
            product.save()
            updated_products += 1

            for region_code, price_payload in prices.items():
                region = regions.get(region_code)
                if not region:
                    self.stdout.write(self.style.WARNING(f"Skipped missing region: {region_code}"))
                    continue
                defaults = {**PRICE_DEFAULTS, **price_payload}
                ProductPrice.objects.update_or_create(
                    product=product,
                    region=region,
                    defaults=defaults,
                )
                updated_prices += 1

        completed_detail_fields = 0
        for product in Product.objects.all():
            changed = False
            unit = UNIT_COMPLETIONS.get(product.slug)
            if unit and not product.unit:
                product.unit = unit
                completed_detail_fields += 1
                changed = True

            for field, value in COMMON_PRODUCT_DEFAULTS.items():
                if not getattr(product, field):
                    setattr(product, field, value)
                    completed_detail_fields += 1
                    changed = True

            if not product.dietary_tags:
                product.dietary_tags = COMMON_DIETARY_TAGS
                completed_detail_fields += 1
                changed = True

            if changed:
                product.save()

        self.stdout.write(
            self.style.SUCCESS(
                "Demo catalog completed: "
                f"{updated_categories} categories, "
                f"{updated_tags} tags, "
                f"{updated_products} products, "
                f"{updated_prices} regional prices, "
                f"{completed_detail_fields} detail fields."
            )
        )
