import Link from "next/link";
import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import { getCmsPageBySlug, getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { buildSeoMetadata } from "@/lib/seo";
import { buildStorePath, normalizeLocale, normalizeRegion } from "@/lib/storefront";

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_WHATSAPP_PHONE || "";

const STATIC_CONTENT = {
  about: {
    en: {
      title: "About Enfant Organics",
      sections: [
        {
          heading: "Who We Are",
          body: "Enfant Organics was founded with a single mission: to give GCC families access to baby care products that are as safe as they are effective. Every product in our range is dermatologically tested by experts in Germany, using only natural, organic-certified ingredients that are free from parabens, sulphates, artificial fragrances, and harsh preservatives.",
        },
        {
          heading: "Our Story",
          body: "Born from a parent's search for trustworthy baby care in the Gulf, Enfant Organics bridges the gap between European organic certification standards and the unique climate demands of the Middle East. Our formulations are specifically developed for the hot, dry conditions of the GCC — addressing concerns like AC-induced dryness, sensitive skin reactions, and sun exposure from an early age.",
        },
        {
          heading: "Our Commitment",
          body: "We are committed to transparency. Every ingredient in every product is listed clearly. We do not use hidden fillers or misleading marketing claims. When we say organic, we mean certified organic. When we say gentle, we mean tested and proven on newborn skin.",
        },
        {
          heading: "Serving the Gulf",
          body: "We deliver across Oman, the United Arab Emirates, and Saudi Arabia. Our regional teams are available via WhatsApp to assist with product selection, order questions, and delivery updates — in both Arabic and English.",
        },
      ],
    },
    ar: {
      title: "عن إنفانت أورجانيك",
      sections: [
        {
          heading: "من نحن",
          body: "تأسست إنفانت أورجانيك بمهمة واحدة: منح عائلات الخليج إمكانية الوصول إلى منتجات عناية بالأطفال آمنة بقدر ما هي فعّالة. كل منتج في مجموعتنا تم اختباره من قِبل خبراء طب الجلدية في ألمانيا، باستخدام مكونات طبيعية معتمدة عضويًا خالية من المواد الضارة.",
        },
        {
          heading: "قصتنا",
          body: "وُلدت إنفانت أورجانيك من بحث أحد الوالدين عن منتجات عناية موثوقة للأطفال في الخليج. تُجسّر منتجاتنا الفجوة بين معايير الشهادات العضوية الأوروبية ومتطلبات المناخ الفريدة في الشرق الأوسط — ومعالجة مشكلات مثل الجفاف الناجم عن التكييف وحساسية البشرة وأضرار الشمس منذ سن مبكرة.",
        },
        {
          heading: "التزامنا",
          body: "نحن ملتزمون بالشفافية. كل مكوّن في كل منتج مدرج بوضوح. لا نستخدم مواد حشو مخفية أو ادعاءات تسويقية مضللة. عندما نقول عضوي، نعني معتمدًا عضويًا. وعندما نقول لطيف، نعني مختبرًا ومثبتًا على بشرة المواليد.",
        },
        {
          heading: "خدمة الخليج",
          body: "نوصّل عبر عُمان والإمارات العربية المتحدة والمملكة العربية السعودية. فرقنا الإقليمية متاحة عبر واتساب للمساعدة في اختيار المنتجات وأسئلة الطلبات وتحديثات التوصيل — بالعربية والإنجليزية.",
        },
      ],
    },
  },

  contact: {
    en: {
      title: "Contact Us",
      sections: [
        {
          heading: "We're Here to Help",
          body: "Our team is available 7 days a week to assist you with product recommendations, order tracking, delivery questions, and returns. Reach us in Arabic or English — whichever is easier for you.",
        },
        {
          heading: "WhatsApp (Fastest)",
          body: "For the quickest response, send us a message on WhatsApp. We typically reply within 30 minutes during business hours (9 AM – 9 PM Gulf time).",
          whatsapp: true,
        },
        {
          heading: "Business Hours",
          body: "Saturday – Thursday: 9:00 AM – 9:00 PM (Gulf Standard Time)\nFriday: 2:00 PM – 9:00 PM",
        },
        {
          heading: "Regional Offices",
          body: "We have local teams in Oman, UAE, and Saudi Arabia. When you reach out, let us know your region and we will connect you with the right team.",
        },
      ],
    },
    ar: {
      title: "تواصل معنا",
      sections: [
        {
          heading: "نحن هنا للمساعدة",
          body: "فريقنا متاح 7 أيام في الأسبوع لمساعدتك في التوصيات، تتبع الطلبات، أسئلة التوصيل، والإرجاع. تواصل معنا بالعربية أو الإنجليزية — أيهما أسهل لك.",
        },
        {
          heading: "واتساب (الأسرع)",
          body: "للحصول على أسرع رد، أرسل لنا رسالة على واتساب. نرد في العادة خلال 30 دقيقة خلال ساعات العمل (9 صباحًا – 9 مساءً بتوقيت الخليج).",
          whatsapp: true,
        },
        {
          heading: "ساعات العمل",
          body: "السبت – الخميس: 9:00 صباحًا – 9:00 مساءً (توقيت الخليج)\nالجمعة: 2:00 مساءً – 9:00 مساءً",
        },
        {
          heading: "المكاتب الإقليمية",
          body: "لدينا فرق محلية في عمان والإمارات والسعودية. عند تواصلك، أخبرنا بمنطقتك وسنوصلك بالفريق المناسب.",
        },
      ],
    },
  },

  faq: {
    en: {
      title: "Frequently Asked Questions",
      sections: [
        {
          heading: "Are your products safe for newborns?",
          body: "Yes. All Enfant Organics products are dermatologically tested on sensitive and newborn skin. They are free from parabens, sulphates, artificial colours, and harsh preservatives. We recommend our Extra Mild Moisture Lotion and Extra Mild Baby Wipes for newborns.",
        },
        {
          heading: "How long does delivery take?",
          body: "Oman: 1–3 business days\nUAE: 2–4 business days\nSaudi Arabia: 3–5 business days\n\nExpress options may be available — contact us on WhatsApp to confirm.",
        },
        {
          heading: "What payment methods do you accept?",
          body: "We accept Cash on Delivery (COD), online card payment via Paymob, bank transfer, and WhatsApp-confirmed orders. All online payments are secured with SSL encryption.",
        },
        {
          heading: "How do I track my order?",
          body: "Use the Track Order page with your order number and the email or phone number used at checkout. You will also receive a WhatsApp or email notification when your order is dispatched.",
        },
        {
          heading: "Can I return a product?",
          body: "We accept returns on unopened, undamaged products within 7 days of delivery. Contact us on WhatsApp with your order number to initiate a return. Opened products cannot be returned for hygiene reasons.",
        },
        {
          heading: "Do you ship outside the GCC?",
          body: "Currently we serve Oman, UAE, and Saudi Arabia. International shipping is not yet available, but we are working on expanding to other regions soon.",
        },
        {
          heading: "Are your products certified organic?",
          body: "Yes. Our products use certified organic ingredients that meet European certification standards. Each product page lists the certifications applicable to that product.",
        },
      ],
    },
    ar: {
      title: "الأسئلة الشائعة",
      sections: [
        {
          heading: "هل منتجاتكم آمنة للمواليد؟",
          body: "نعم. جميع منتجات إنفانت أورجانيك تم اختبارها طبيًا على البشرة الحساسة وبشرة المواليد. خالية من المواد الضارة ومعتمدة للاستخدام الآمن.",
        },
        {
          heading: "كم تستغرق مدة التوصيل؟",
          body: "عُمان: 1–3 أيام عمل\nالإمارات: 2–4 أيام عمل\nالسعودية: 3–5 أيام عمل\n\nتواصل معنا على واتساب لتأكيد خيارات التوصيل السريع.",
        },
        {
          heading: "ما طرق الدفع المتاحة؟",
          body: "نقبل الدفع عند الاستلام، والدفع الإلكتروني عبر Paymob، والتحويل البنكي، والطلب عبر واتساب.",
        },
        {
          heading: "كيف أتتبع طلبي؟",
          body: "استخدم صفحة تتبع الطلب برقم طلبك والبريد الإلكتروني أو الهاتف المستخدم عند الشراء.",
        },
        {
          heading: "هل يمكنني إرجاع منتج؟",
          body: "نقبل الإرجاع على المنتجات غير المفتوحة وغير التالفة خلال 7 أيام من الاستلام. تواصل معنا على واتساب برقم طلبك.",
        },
        {
          heading: "هل تشحنون خارج الخليج؟",
          body: "حاليًا نخدم عُمان والإمارات والسعودية. نعمل على التوسع قريبًا.",
        },
        {
          heading: "هل منتجاتكم معتمدة عضويًا؟",
          body: "نعم. منتجاتنا تستخدم مكونات عضوية معتمدة وفق المعايير الأوروبية.",
        },
      ],
    },
  },

  "shipping-policy": {
    en: {
      title: "Shipping Policy",
      sections: [
        {
          heading: "Delivery Areas",
          body: "We currently deliver to Oman, the United Arab Emirates, and Saudi Arabia. Deliveries are made to residential and commercial addresses.",
        },
        {
          heading: "Delivery Timeframes",
          body: "Oman: 1–3 business days\nUAE: 2–4 business days\nSaudi Arabia: 3–5 business days\n\nOrders placed before 2:00 PM Gulf time on a business day are typically processed the same day.",
        },
        {
          heading: "Shipping Fees",
          body: "Shipping fees are calculated at checkout based on your region and order total. Orders that reach the free-shipping threshold for your region qualify for complimentary delivery. Contact us on WhatsApp for the current threshold in your region.",
        },
        {
          heading: "Tracking",
          body: "Once your order is dispatched, you will receive a tracking number via WhatsApp or email. You can also use our Track Order page at any time.",
        },
        {
          heading: "Missed Deliveries",
          body: "If a delivery attempt is unsuccessful, our courier will contact you to reschedule. After two failed attempts, the order may be returned and a re-delivery fee may apply.",
        },
      ],
    },
    ar: {
      title: "سياسة الشحن",
      sections: [
        {
          heading: "مناطق التوصيل",
          body: "نوصّل حاليًا إلى عُمان والإمارات والسعودية، إلى العناوين السكنية والتجارية.",
        },
        {
          heading: "مدد التوصيل",
          body: "عُمان: 1–3 أيام عمل\nالإمارات: 2–4 أيام عمل\nالسعودية: 3–5 أيام عمل\n\nالطلبات المقدّمة قبل الساعة 2:00 ظهرًا تُعالج عادةً في نفس اليوم.",
        },
        {
          heading: "رسوم الشحن",
          body: "تحسب رسوم الشحن عند الدفع بناءً على منطقتك وإجمالي الطلب. الطلبات التي تبلغ حد الشحن المجاني تحصل على توصيل مجاني.",
        },
        {
          heading: "التتبع",
          body: "بمجرد شحن طلبك، ستتلقى رقم التتبع عبر واتساب أو البريد الإلكتروني.",
        },
        {
          heading: "محاولات التوصيل الفاشلة",
          body: "إذا فشلت محاولة التوصيل، سيتصل بك المندوب لإعادة الجدولة. بعد محاولتين فاشلتين قد يُعاد الطلب وتُطبَّق رسوم إعادة توصيل.",
        },
      ],
    },
  },

  "return-policy": {
    en: {
      title: "Return & Refund Policy",
      sections: [
        {
          heading: "Return Eligibility",
          body: "We accept returns on products that are unopened, undamaged, and in their original packaging within 7 days of the delivery date. Opened or used products cannot be returned for hygiene and safety reasons.",
        },
        {
          heading: "How to Request a Return",
          body: "Contact our team on WhatsApp with your order number and the reason for the return. We will guide you through the return process and arrange a collection from your address.",
          whatsapp: true,
        },
        {
          heading: "Refunds",
          body: "Once the returned item is received and inspected, we will process your refund within 5–7 business days. Refunds are issued to the original payment method. Cash on Delivery orders are refunded via bank transfer.",
        },
        {
          heading: "Damaged or Incorrect Items",
          body: "If you receive a damaged or incorrect item, contact us within 48 hours of delivery with a photo. We will arrange a replacement or refund at no additional cost.",
        },
        {
          heading: "Non-Returnable Items",
          body: "Opened products, items marked as final sale, and free gifts included with an order cannot be returned.",
        },
      ],
    },
    ar: {
      title: "سياسة الإرجاع والاسترداد",
      sections: [
        {
          heading: "شروط الإرجاع",
          body: "نقبل إرجاع المنتجات غير المفتوحة وغير التالفة في عبوتها الأصلية خلال 7 أيام من تاريخ الاستلام. لا يمكن إرجاع المنتجات المفتوحة أو المستخدمة لأسباب صحية.",
        },
        {
          heading: "كيفية طلب الإرجاع",
          body: "تواصل معنا عبر واتساب برقم طلبك وسبب الإرجاع. سنرشدك خلال العملية وننظم الاستلام من عنوانك.",
          whatsapp: true,
        },
        {
          heading: "المبالغ المستردة",
          body: "بعد استلام المنتج المُعاد وفحصه، نعالج استردادك خلال 5–7 أيام عمل. تُستردّ المبالغ إلى طريقة الدفع الأصلية.",
        },
        {
          heading: "المنتجات التالفة أو الخاطئة",
          body: "إذا استلمت منتجًا تالفًا أو خاطئًا، تواصل معنا خلال 48 ساعة بصورة. سنرتب استبدالًا أو استردادًا بدون تكلفة إضافية.",
        },
        {
          heading: "المنتجات غير القابلة للإرجاع",
          body: "المنتجات المفتوحة والعناصر المحددة كبيع نهائي والهدايا المجانية لا يمكن إرجاعها.",
        },
      ],
    },
  },

  "privacy-policy": {
    en: {
      title: "Privacy Policy",
      sections: [
        {
          heading: "Information We Collect",
          body: "We collect information you provide directly: name, email address, phone number, and delivery address when you place an order or create an account. We also collect usage data to improve our storefront.",
        },
        {
          heading: "How We Use Your Information",
          body: "Your information is used exclusively to process and deliver your orders, communicate order updates, respond to support requests, and send newsletter communications if you have opted in.",
        },
        {
          heading: "Data Sharing",
          body: "We do not sell or share your personal information with third parties, except as required to fulfil your order (e.g., delivery partners) or as required by law.",
        },
        {
          heading: "Payment Security",
          body: "Online payments are processed by Paymob, a PCI-compliant payment gateway. Enfant Organics never stores your card details.",
        },
        {
          heading: "Your Rights",
          body: "You have the right to access, correct, or delete your personal data at any time. Contact us on WhatsApp or email to make a request.",
          whatsapp: true,
        },
        {
          heading: "Cookies",
          body: "We use essential cookies only — to maintain your cart session and remember your region preference. We do not use tracking or advertising cookies.",
        },
      ],
    },
    ar: {
      title: "سياسة الخصوصية",
      sections: [
        {
          heading: "المعلومات التي نجمعها",
          body: "نجمع المعلومات التي تقدمها مباشرةً: الاسم والبريد الإلكتروني والهاتف وعنوان التوصيل عند تقديم الطلب أو إنشاء حساب.",
        },
        {
          heading: "كيف نستخدم معلوماتك",
          body: "تُستخدم معلوماتك حصرًا لمعالجة طلباتك وتوصيلها، والتواصل بشأن التحديثات، والردّ على طلبات الدعم، وإرسال النشرة البريدية إن اشتركت فيها.",
        },
        {
          heading: "مشاركة البيانات",
          body: "لا نبيع معلوماتك الشخصية أو نشاركها مع أطراف ثالثة، إلا بما هو ضروري لتنفيذ طلبك أو كما يقتضيه القانون.",
        },
        {
          heading: "أمان الدفع",
          body: "تتم معالجة المدفوعات الإلكترونية عبر Paymob، بوابة دفع متوافقة مع معايير PCI. لا تخزّن إنفانت أورجانيك بيانات بطاقتك.",
        },
        {
          heading: "حقوقك",
          body: "يحق لك الوصول إلى بياناتك الشخصية أو تصحيحها أو حذفها في أي وقت. تواصل معنا للقيام بذلك.",
        },
        {
          heading: "ملفات الارتباط (الكوكيز)",
          body: "نستخدم ملفات الارتباط الأساسية فقط — للحفاظ على جلسة سلة التسوق وتذكر تفضيل منطقتك. لا نستخدم ملفات تتبع أو إعلانات.",
        },
      ],
    },
  },

  "cookie-policy": {
    en: {
      title: "Cookie Policy",
      sections: [
        {
          heading: "How We Use Cookies",
          body: "We use cookies to keep your cart active, remember your selected region and language, and improve page performance.",
        },
        {
          heading: "Essential Cookies",
          body: "Essential cookies help core checkout and account features work correctly. Without them, some storefront features may not function.",
        },
        {
          heading: "Preference Cookies",
          body: "Preference cookies remember settings such as your region and language to make future visits easier.",
        },
        {
          heading: "Manage Your Cookie Preferences",
          body: "You can control cookies in your browser settings. Blocking all cookies may impact checkout, login, and cart behavior.",
        },
      ],
    },
    ar: {
      title: "سياسة ملفات الارتباط",
      sections: [
        {
          heading: "كيف نستخدم ملفات الارتباط",
          body: "نستخدم ملفات الارتباط للحفاظ على سلة التسوق، وتذكر المنطقة واللغة المختارة، وتحسين أداء الصفحات.",
        },
        {
          heading: "الملفات الأساسية",
          body: "تساعد الملفات الأساسية في عمل ميزات الحساب والدفع بشكل صحيح. بدونها قد لا تعمل بعض خصائص المتجر.",
        },
        {
          heading: "ملفات التفضيلات",
          body: "تتذكر ملفات التفضيلات إعداداتك مثل المنطقة واللغة لتسهيل الزيارات القادمة.",
        },
        {
          heading: "إدارة تفضيلات ملفات الارتباط",
          body: "يمكنك التحكم بملفات الارتباط من إعدادات المتصفح. قد يؤثر حظر جميع الملفات على تسجيل الدخول والدفع والسلة.",
        },
      ],
    },
  },

  "payment-options": {
    en: {
      title: "Payment Options",
      sections: [
        {
          heading: "Available Methods",
          body: "We support secure card payments and other regional methods shown at checkout. Payment methods may vary by region.",
        },
        {
          heading: "When You Place an Order",
          body: "The checkout page will show the payment methods available for your selected delivery region before you confirm payment.",
        },
        {
          heading: "Payment Security",
          body: "Online payments are processed through trusted payment partners. We do not store complete card details on our storefront.",
        },
      ],
    },
    ar: {
      title: "خيارات الدفع",
      sections: [
        {
          heading: "طرق الدفع المتاحة",
          body: "ندعم الدفع الآمن بالبطاقات وطرقًا إقليمية أخرى تظهر عند الدفع. قد تختلف طرق الدفع حسب المنطقة.",
        },
        {
          heading: "عند إنشاء الطلب",
          body: "تعرض صفحة الدفع الوسائل المتاحة لمنطقتك المحددة قبل تأكيد عملية الدفع.",
        },
        {
          heading: "أمان الدفع",
          body: "تتم معالجة المدفوعات الإلكترونية عبر شركاء دفع موثوقين، ولا نقوم بتخزين بيانات البطاقة كاملة على المتجر.",
        },
      ],
    },
  },

  shipping: {
    en: {
      title: "Shipping Information",
      sections: [
        {
          heading: "Where We Deliver",
          body: "We currently deliver across Oman, the UAE, and Saudi Arabia.",
        },
        {
          heading: "Estimated Timelines",
          body: "Delivery timing depends on your city and selected method. The latest estimate is shown during checkout.",
        },
        {
          heading: "Shipping Fees",
          body: "Shipping charges are calculated at checkout based on region and basket value. Free-shipping eligibility may vary by region.",
        },
      ],
    },
    ar: {
      title: "معلومات الشحن",
      sections: [
        {
          heading: "مناطق التوصيل",
          body: "نوصّل حاليًا داخل عُمان والإمارات العربية المتحدة والمملكة العربية السعودية.",
        },
        {
          heading: "المدة المتوقعة",
          body: "تعتمد مدة التوصيل على المدينة وطريقة الشحن المختارة. يظهر التقدير الأحدث أثناء الدفع.",
        },
        {
          heading: "رسوم الشحن",
          body: "تُحسب رسوم الشحن أثناء الدفع حسب المنطقة وقيمة السلة. قد تختلف أهلية الشحن المجاني حسب المنطقة.",
        },
      ],
    },
  },

  returns: {
    en: {
      title: "Returns Policy",
      sections: [
        {
          heading: "Return Eligibility",
          body: "Unopened and undamaged products may be eligible for return within the return window shown at checkout and in your order details.",
        },
        {
          heading: "How to Start a Return",
          body: "Sign in to your account and request a return from your order history, or contact our support team for guidance.",
        },
        {
          heading: "Refund Timeline",
          body: "If approved, refunds are processed to the original payment method based on your provider's processing time.",
        },
      ],
    },
    ar: {
      title: "سياسة الإرجاع",
      sections: [
        {
          heading: "أهلية الإرجاع",
          body: "قد تكون المنتجات غير المفتوحة وغير التالفة مؤهلة للإرجاع خلال الفترة الموضحة عند الدفع وفي تفاصيل الطلب.",
        },
        {
          heading: "كيفية بدء الإرجاع",
          body: "سجّل الدخول إلى حسابك واطلب الإرجاع من سجل الطلبات، أو تواصل مع فريق الدعم للمساعدة.",
        },
        {
          heading: "مدة الاسترداد",
          body: "عند الموافقة، يُعالج الاسترداد إلى وسيلة الدفع الأصلية وفق مدة المعالجة لدى مزود الدفع.",
        },
      ],
    },
  },

  ingredients: {
    en: {
      title: "Ingredients",
      sections: [
        {
          heading: "How We Choose Ingredients",
          body: "Our ingredients are selected with care for delicate baby skin and everyday family use.",
        },
        {
          heading: "Transparency First",
          body: "We aim to keep product ingredient information clear on product pages so parents can make informed decisions.",
        },
        {
          heading: "Need Help Choosing",
          body: "If your child has specific sensitivities, contact our support team and we can help you compare suitable options.",
        },
      ],
    },
    ar: {
      title: "المكونات",
      sections: [
        {
          heading: "كيف نختار المكونات",
          body: "يتم اختيار مكوناتنا بعناية لتناسب بشرة الأطفال الحساسة والاستخدام اليومي للعائلة.",
        },
        {
          heading: "الشفافية أولًا",
          body: "نحرص على عرض معلومات المكونات بوضوح في صفحات المنتجات لمساعدة الأهالي على اتخاذ قرار مناسب.",
        },
        {
          heading: "المساعدة في الاختيار",
          body: "إذا كانت لدى طفلك حساسية معينة، تواصل مع فريق الدعم وسنساعدك في مقارنة الخيارات المناسبة.",
        },
      ],
    },
  },

  certifications: {
    en: {
      title: "Certifications",
      sections: [
        {
          heading: "Our Approach",
          body: "We value third-party standards and clear product documentation whenever available.",
        },
        {
          heading: "Product-Level Details",
          body: "Certification details can be updated by the store admin and may differ by product and supplier.",
        },
        {
          heading: "Before You Purchase",
          body: "Please check the latest product page details for the most current certification information.",
        },
      ],
    },
    ar: {
      title: "الشهادات",
      sections: [
        {
          heading: "نهجنا",
          body: "نقدّر المعايير المعتمدة من جهات خارجية وتوثيق المنتجات بوضوح عند توفره.",
        },
        {
          heading: "تفاصيل حسب المنتج",
          body: "يمكن تحديث تفاصيل الشهادات من قبل إدارة المتجر، وقد تختلف حسب المنتج والمورّد.",
        },
        {
          heading: "قبل الشراء",
          body: "يرجى مراجعة صفحة المنتج للاطلاع على أحدث معلومات الشهادات.",
        },
      ],
    },
  },

  sustainability: {
    en: {
      title: "Sustainability",
      sections: [
        {
          heading: "Responsible Choices",
          body: "We aim to make thoughtful decisions in sourcing, packaging, and fulfillment wherever practical.",
        },
        {
          heading: "Continuous Improvement",
          body: "Sustainability is an ongoing journey. We review materials and operations regularly to reduce waste over time.",
        },
        {
          heading: "What You Can Expect",
          body: "You may see updates to packaging and logistics as we improve our sustainability practices.",
        },
      ],
    },
    ar: {
      title: "الاستدامة",
      sections: [
        {
          heading: "خيارات مسؤولة",
          body: "نسعى لاتخاذ قرارات مدروسة في التوريد والتغليف والتوصيل كلما كان ذلك عمليًا.",
        },
        {
          heading: "تحسين مستمر",
          body: "الاستدامة رحلة مستمرة. نراجع المواد والعمليات بشكل دوري لتقليل الهدر مع الوقت.",
        },
        {
          heading: "ما يمكن توقعه",
          body: "قد تلاحظ تحديثات في التغليف والعمليات اللوجستية ضمن جهودنا لتطوير ممارسات الاستدامة.",
        },
      ],
    },
  },

  "our-standards": {
    en: {
      title: "Our Standards",
      sections: [
        {
          heading: "Built for Delicate Skin",
          body: "We focus on gentle formulations and practical product quality checks designed for baby-care routines.",
        },
        {
          heading: "Clear Communication",
          body: "We work to keep ingredient and usage information understandable so families can shop with confidence.",
        },
        {
          heading: "Regional Support",
          body: "Our team can guide you in choosing products based on climate, routine, and age stage across GCC markets.",
        },
      ],
    },
    ar: {
      title: "معاييرنا",
      sections: [
        {
          heading: "مصممة للبشرة الحساسة",
          body: "نركز على تركيبات لطيفة وفحوصات جودة عملية تناسب روتين العناية بالأطفال.",
        },
        {
          heading: "تواصل واضح",
          body: "نعمل على تقديم معلومات المكونات والاستخدام بشكل سهل لتسوق بثقة.",
        },
        {
          heading: "دعم إقليمي",
          body: "يمكن لفريقنا مساعدتك في اختيار المنتجات المناسبة حسب المناخ والروتين والمرحلة العمرية داخل أسواق الخليج.",
        },
      ],
    },
  },

  terms: {
    en: {
      title: "Terms & Conditions",
      sections: [
        {
          heading: "Acceptance of Terms",
          body: "By accessing and placing an order through Enfant Organics, you accept and agree to these terms and conditions. Please read them carefully before purchasing.",
        },
        {
          heading: "Product Availability",
          body: "All products are subject to availability. We reserve the right to discontinue any product at any time. In the event of a stock shortage after your order is placed, we will contact you to offer an alternative or a full refund.",
        },
        {
          heading: "Pricing",
          body: "All prices are listed in the currency of your selected region and include applicable taxes. Prices are subject to change without notice, but orders placed at the time of purchase will be honoured at the price shown.",
        },
        {
          heading: "Order Confirmation",
          body: "An order is confirmed once you receive an order number. We reserve the right to cancel orders in cases of pricing errors, fraud, or stock issues, with a full refund processed promptly.",
        },
        {
          heading: "Governing Law",
          body: "These terms are governed by the laws of the Sultanate of Oman. Disputes relating to UAE or KSA orders will be handled in accordance with local regulations.",
        },
      ],
    },
    ar: {
      title: "الشروط والأحكام",
      sections: [
        {
          heading: "قبول الشروط",
          body: "بالوصول إلى متجر إنفانت أورجانيك وتقديم طلب، فإنك توافق على هذه الشروط والأحكام. يرجى قراءتها بعناية قبل الشراء.",
        },
        {
          heading: "توفر المنتجات",
          body: "جميع المنتجات خاضعة للتوفر. نحتفظ بالحق في وقف أي منتج في أي وقت. في حال نقص المخزون بعد تقديم طلبك، سنتواصل معك لتقديم بديل أو استرداد كامل.",
        },
        {
          heading: "الأسعار",
          body: "جميع الأسعار مدرجة بعملة منطقتك المختارة وتشمل الضرائب المعمول بها. الأسعار عرضة للتغيير دون إشعار، لكن الطلبات المقدّمة تُحترم بالسعر الظاهر وقت الشراء.",
        },
        {
          heading: "تأكيد الطلب",
          body: "يُعتبر الطلب مؤكدًا عند استلام رقم الطلب. نحتفظ بالحق في إلغاء الطلبات في حالات أخطاء الأسعار أو الاحتيال أو مشكلات المخزون، مع استرداد كامل.",
        },
        {
          heading: "القانون الحاكم",
          body: "تخضع هذه الشروط لقوانين سلطنة عُمان. تُعالج النزاعات المتعلقة بطلبات الإمارات والسعودية وفق اللوائح المحلية.",
        },
      ],
    },
  },
};

function buildCmsContent(cmsPage) {
  const bodyText = String(cmsPage?.body || "").trim();
  return {
    title: String(cmsPage?.title || "").trim(),
    sections: bodyText
      ? [
          {
            heading: "",
            body: bodyText,
          },
        ]
      : [],
  };
}

async function resolvePageContent({ pageSlug, locale, region }) {
  const cmsPage = await getCmsPageBySlug(pageSlug, locale, region);
  if (cmsPage) {
    return {
      source: "cms",
      cmsPage,
      content: buildCmsContent(cmsPage),
    };
  }

  const staticContent = STATIC_CONTENT?.[pageSlug]?.[locale] || null;
  if (staticContent) {
    return {
      source: "static",
      cmsPage: null,
      content: staticContent,
    };
  }

  return {
    source: "none",
    cmsPage: null,
    content: null,
  };
}

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam, pageSlug } = await params;
  const locale = normalizeLocale(localeParam);
  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const resolved = await resolvePageContent({ pageSlug, locale, region });
  const content = resolved.content;
  const isAr = locale === "ar";

  if (!content) {
    return {};
  }

  const seoTitle = resolved.cmsPage?.seo_title;
  const seoDescription = resolved.cmsPage?.seo_description;
  const title = seoTitle ? `${seoTitle} | Enfant Organics` : `${content.title} | Enfant Organics`;
  const fallbackDescription = isAr
    ? "معلومات ومتطلبات الشراء من إنفانت أورجانيك."
    : "Important storefront information from Enfant Organics.";
  const description = seoDescription || content.sections?.[0]?.body || fallbackDescription;

  return buildSeoMetadata({
    locale,
    region,
    path: `/${pageSlug}`,
    title,
    description,
    image: "/enfant/enfant-logo.png",
  });
}

export default async function StaticPage({ params, searchParams }) {
  const { locale: localeParam, pageSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) {
    notFound();
  }

  const region = resolveServerRegion(resolvedSearchParams);
  const [navigation, resolved] = await Promise.all([
    getNavigationData(locale, region),
    resolvePageContent({ pageSlug, locale, region }),
  ]);

  if (!resolved.content) {
    notFound();
  }

  const content = resolved.content;
  const phone = WHATSAPP_PHONE || navigation?.contact?.phone || "";
  const waLink = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : "#";
  const isAr = locale === "ar";

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <main className="section container">
        <div className="static-page-layout">
          <header className="static-page-header">
            <h1>{content.title}</h1>
          </header>

          <div className="static-page-body">
            {content.sections.map((section, i) => (
              <div key={i} className="static-section">
                {section.heading ? <h2>{section.heading}</h2> : null}
                {section.body.split("\n").filter(Boolean).map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
                {section.whatsapp && phone ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whatsapp-cta"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
                    </svg>
                    {isAr ? "تواصل عبر واتساب" : "Chat on WhatsApp"}
                  </a>
                ) : null}
              </div>
            ))}
          </div>

          <div className="static-page-footer">
            <Link href={buildStorePath(locale, "/", region)} className="section-link">
              {isAr ? "→ العودة للرئيسية" : "← Back to Home"}
            </Link>
          </div>
        </div>
      </main>
    </StorefrontShell>
  );
}
