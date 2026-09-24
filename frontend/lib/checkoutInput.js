// Input normalisation and error text for the checkout form.
//
// Shoppers in Oman / UAE / KSA type in English or Arabic. Arabic keyboards
// produce Arabic-Indic digits (٠١٢…), Urdu/Persian keyboards produce ۰۱۲…, and a
// number pasted from contacts or WhatsApp often carries invisible bidi marks
// and non-breaking spaces. The backend normalises the same way
// (backend/store/text_input.py); doing it here too keeps the browser's own
// validation and the abandoned-cart capture consistent with what gets stored.

const INVISIBLE = /[\u00ad\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
const DASHES = /[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g;

export function toAsciiDigits(value) {
  return String(value ?? "")
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/[\uff10-\uff19]/g, (ch) => String(ch.charCodeAt(0) - 0xff10));
}

// Applied on every keystroke, so it must not trim or collapse spaces the
// shopper is in the middle of typing.
export function normalizePhoneInput(value) {
  return toAsciiDigits(String(value ?? "").replace(INVISIBLE, ""))
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(DASHES, "-")
    .replace(/\uff0b/g, "+")
    .replace(/\uff08/g, "(")
    .replace(/\uff09/g, ")");
}

// The browser's type="email" check rejects Arabic digits, so convert them
// before it runs. Also the Urdu full stop (۔) and stray spaces.
export function normalizeEmailInput(value) {
  return toAsciiDigits(String(value ?? "").normalize("NFKC").replace(INVISIBLE, ""))
    .replace(/\u06d4/g, ".")
    .replace(/\s+/g, "");
}

// Numeric-ish address parts. Words stay in whatever script was typed.
export function normalizeDigitsInput(value) {
  return toAsciiDigits(String(value ?? "").replace(INVISIBLE, ""));
}

export function normalizeCodeInput(value) {
  return toAsciiDigits(String(value ?? "").normalize("NFKC").replace(INVISIBLE, ""));
}

// Same rule as the backend: optional leading +, digits and separators, 8–15 digits.
// Written without unescaped ( ) - inside the class so it also compiles under
// the `v` flag browsers use for the HTML pattern attribute.
export const PHONE_PATTERN = "\\+?[0-9 .\\(\\)\\-]{8,32}";

const FIELD_LABELS = {
  name: { en: "Full name", ar: "الاسم الكامل" },
  phone: { en: "Phone number", ar: "رقم الهاتف" },
  email: { en: "Email address", ar: "البريد الإلكتروني" },
  address_line_1: { en: "Address", ar: "العنوان" },
  address_line_2: { en: "Address line 2", ar: "العنوان (سطر 2)" },
  building: { en: "Building", ar: "المبنى" },
  floor: { en: "Floor", ar: "الطابق" },
  apartment: { en: "Apartment", ar: "الشقة" },
  landmark: { en: "Landmark", ar: "معلم قريب" },
  area: { en: "Area", ar: "المنطقة" },
  city: { en: "City", ar: "المدينة" },
  postcode: { en: "Postcode", ar: "الرمز البريدي" },
  country: { en: "Country", ar: "الدولة" },
  location_notes: { en: "Location notes", ar: "ملاحظات الموقع" },
  notes: { en: "Order notes", ar: "ملاحظات الطلب" },
  coupon_code: { en: "Coupon code", ar: "كود الخصم" },
  gift_card_code: { en: "Gift card code", ar: "كود بطاقة الهدية" },
};

// Backend messages the checkout can surface, with their Arabic wording.
const AR_MESSAGES = [
  [/^Enter a valid phone number/, "يرجى إدخال رقم هاتف صحيح (من 8 إلى 15 رقماً، ويمكن أن يبدأ بـ +)."],
  [/^Name is required/, "الاسم مطلوب (حرفان على الأقل)."],
  [/^Name contains unsupported characters/, "الاسم يحتوي على رموز غير مدعومة."],
  [/^Enter a valid email address/, "يرجى إدخال بريد إلكتروني صحيح."],
  [/^This field is required|^This field may not be blank|^This field may not be null/, "هذا الحقل مطلوب."],
  [/^Ensure this field has no more than (\d+) characters/, (m) => `يجب ألا يزيد هذا الحقل عن ${m[1]} حرفاً.`],
  [/^Ensure this field has at least (\d+) characters/, (m) => `يجب ألا يقل هذا الحقل عن ${m[1]} أحرف.`],
  [/^Map pin is required/, "يرجى تحديد موقع التوصيل على الخريطة أو كتابة العنوان."],
  [/^Latitude must be|^Longitude must be/, "موقع الخريطة غير صالح، يرجى تحديده مرة أخرى."],
  [/^Invalid region/, "المنطقة غير صالحة."],
  [/^Cart is empty/, "سلة التسوق فارغة."],
  [/^Invalid coupon code/, "كود الخصم غير صالح."],
  [/^Coupon is not active yet/, "كود الخصم غير مفعّل بعد."],
  [/^Coupon has expired/, "انتهت صلاحية كود الخصم."],
  [/^Minimum subtotal required is (.+?)\.?$/, (m) => `الحد الأدنى للمجموع الفرعي المطلوب هو ${m[1]}.`],
  [/^Coupon usage limit reached/, "تم الوصول إلى الحد الأقصى لاستخدام كود الخصم."],
  [/^Coupon is not valid for this region/, "كود الخصم غير صالح لهذه المنطقة."],
  [/^Coupon is not valid for these products/, "كود الخصم غير صالح لهذه المنتجات."],
  [/^Gift card code is invalid/, "كود بطاقة الهدية غير صالح."],
  [/^This gift card is not active/, "بطاقة الهدية غير مفعّلة."],
  [/^This gift card has expired/, "انتهت صلاحية بطاقة الهدية."],
  [/^This gift card is not valid for this region/, "بطاقة الهدية غير صالحة لهذه المنطقة."],
  [/^This gift card currency does not match/, "عملة بطاقة الهدية لا تطابق منطقتك."],
  [/^This gift card has no remaining balance/, "لا يوجد رصيد متبقٍ في بطاقة الهدية."],
  [/^This order has no payable amount/, "لا يوجد مبلغ مستحق لاستخدام بطاقة الهدية."],
  [/^This gift card cannot be applied/, "لا يمكن استخدام بطاقة الهدية لهذا الطلب."],
  [/^Only (\d+) item\(s\) available for (.+?)\.?$/, (m) => `الكمية المتوفرة من ${m[2]} هي ${m[1]} فقط.`],
  [/^Product not found|^Price not configured|^Selected variant is not available/, "أحد المنتجات في السلة لم يعد متوفراً. يرجى تحديث السلة."],
  [/^Choose a variant/, "يرجى اختيار الخيار المطلوب لأحد المنتجات في السلة."],
  [/^Coupon and gift card applied/, "تم تطبيق كود الخصم وبطاقة الهدية."],
  [/^Coupon applied/, "تم تطبيق الكوبون."],
  [/^Gift card applied/, "تم تطبيق بطاقة الهدية."],
  [/^Totals updated/, "تم تحديث المجموع."],
  [/^Request was throttled/, "محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى."],
];

// Messages that only make sense next to the name of the field they refer to.
const GENERIC = /^(This field|Ensure this field)/;

export function localizeApiMessage(message, isAr) {
  const text = String(message || "");
  if (!isAr) return text;
  for (const [pattern, translation] of AR_MESSAGES) {
    const match = text.match(pattern);
    if (match) return typeof translation === "function" ? translation(match) : translation;
  }
  return text;
}

// DRF errors can nest: {"customer": {"phone": ["..."]}} or
// {"items": [{}, {"quantity": ["..."]}]}. Return the first leaf and its field.
function firstError(value, field = "") {
  if (value == null) return null;
  if (typeof value === "string") return { field, message: value };
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstError(item, field);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const found = firstError(item, key === "non_field_errors" ? field : key);
      if (found) return found;
    }
  }
  return null;
}

export function apiErrorMessage(data, { isAr = false, fallback = "" } = {}) {
  const found = firstError(data && typeof data === "object" && data.detail ? data.detail : data);
  if (!found || !found.message) return fallback;
  const message = localizeApiMessage(found.message, isAr);
  const label = FIELD_LABELS[found.field];
  if (label && GENERIC.test(found.message)) {
    return `${isAr ? label.ar : label.en}: ${message}`;
  }
  return message;
}
