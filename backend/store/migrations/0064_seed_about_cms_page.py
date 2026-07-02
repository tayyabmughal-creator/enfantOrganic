from django.db import migrations

# Mirrors the hardcoded STATIC_CONTENT.about copy in
# frontend/app/[locale]/[pageSlug]/page.jsx so seeding this row doesn't change
# what visitors see — it just makes the copy admin-editable going forward.
ABOUT_BODY_EN = """
<h2>Who We Are</h2>
<p>Enfant Organics was founded with a single mission: to give GCC families access to baby care products that are as safe as they are effective. Every product in our range is dermatologically tested by experts in Germany, using only natural, organic-certified ingredients that are free from parabens, sulphates, artificial fragrances, and harsh preservatives.</p>
<h2>Our Story</h2>
<p>Born from a parent's search for trustworthy baby care in the Gulf, Enfant Organics bridges the gap between European organic certification standards and the unique climate demands of the Middle East. Our formulations are specifically developed for the hot, dry conditions of the GCC — addressing concerns like AC-induced dryness, sensitive skin reactions, and sun exposure from an early age.</p>
<h2>Our Commitment</h2>
<p>We are committed to transparency. Every ingredient in every product is listed clearly. We do not use hidden fillers or misleading marketing claims. When we say organic, we mean certified organic. When we say gentle, we mean tested and proven on newborn skin.</p>
<h2>Serving the Gulf</h2>
<p>We deliver across Oman, the United Arab Emirates, and Saudi Arabia. Our regional teams are available via WhatsApp to assist with product selection, order questions, and delivery updates — in both Arabic and English.</p>
""".strip()

ABOUT_BODY_AR = """
<h2>من نحن</h2>
<p>تأسست إنفانت أورجانيك بمهمة واحدة: منح عائلات الخليج إمكانية الوصول إلى منتجات عناية بالأطفال آمنة بقدر ما هي فعّالة. كل منتج في مجموعتنا تم اختباره من قِبل خبراء طب الجلدية في ألمانيا، باستخدام مكونات طبيعية معتمدة عضويًا خالية من المواد الضارة.</p>
<h2>قصتنا</h2>
<p>وُلدت إنفانت أورجانيك من بحث أحد الوالدين عن منتجات عناية موثوقة للأطفال في الخليج. تُجسّر منتجاتنا الفجوة بين معايير الشهادات العضوية الأوروبية ومتطلبات المناخ الفريدة في الشرق الأوسط — ومعالجة مشكلات مثل الجفاف الناجم عن التكييف وحساسية البشرة وأضرار الشمس منذ سن مبكرة.</p>
<h2>التزامنا</h2>
<p>نحن ملتزمون بالشفافية. كل مكوّن في كل منتج مدرج بوضوح. لا نستخدم مواد حشو مخفية أو ادعاءات تسويقية مضللة. عندما نقول عضوي، نعني معتمدًا عضويًا. وعندما نقول لطيف، نعني مختبرًا ومثبتًا على بشرة المواليد.</p>
<h2>خدمة الخليج</h2>
<p>نوصّل عبر عُمان والإمارات العربية المتحدة والمملكة العربية السعودية. فرقنا الإقليمية متاحة عبر واتساب للمساعدة في اختيار المنتجات وأسئلة الطلبات وتحديثات التوصيل — بالعربية والإنجليزية.</p>
""".strip()


def seed_about_page(apps, schema_editor):
    CmsPage = apps.get_model("store", "CmsPage")
    CmsPage.objects.get_or_create(
        slug="about",
        region=None,
        defaults={
            "title_en": "About Enfant Organics",
            "title_ar": "عن إنفانت أورجانيك",
            "body_en": ABOUT_BODY_EN,
            "body_ar": ABOUT_BODY_AR,
            "is_published": True,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0063_newslettersubscription_country_code_page_path"),
    ]

    operations = [
        migrations.RunPython(seed_about_page, migrations.RunPython.noop),
    ]
