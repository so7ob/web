import type { SettingSection } from "@so7ob/contracts";
export const sectionLabels: Record<SettingSection, [string, string]> = {
  identity: ["الهوية", "Identity"],
  appearance: ["مظهر الموقع", "Site appearance"],
  adminAppearance: ["مظهر الإدارة", "Administration appearance"],
  contact: ["التواصل", "Contact"],
  sharing: ["المشاركة والبحث", "Sharing & search"],
  announcement: ["الإعلانات", "Announcements"],
  tracking: ["المتابعة والرد", "Tracking & response"],
};
export const settingLabels: Record<string, [string, string]> = {
  "site.nameAr": ["اسم الموقع بالعربية", "Arabic site name"],
  "site.nameEn": ["اسم الموقع بالإنجليزية", "English site name"],
  "identity.showName": ["عرض الاسم بجوار الشعار", "Show name beside logo"],
  "identity.logoArLight": [
    "الشعار العربي — سطح فاتح",
    "Arabic logo — light surface",
  ],
  "identity.logoEnLight": [
    "الشعار الإنجليزي — سطح فاتح",
    "English logo — light surface",
  ],
  "identity.logoArDark": [
    "الشعار العربي — سطح داكن",
    "Arabic logo — dark surface",
  ],
  "identity.logoEnDark": [
    "الشعار الإنجليزي — سطح داكن",
    "English logo — dark surface",
  ],
  "identity.icon": ["أيقونة الموقع (PNG)", "Site icon (PNG)"],
  "appearance.mode": ["وضع العرض الافتراضي", "Default color mode"],
  "appearance.adminStyle": ["نمط الإدارة", "Administration style"],
  "appearance.primaryLight": ["اللون الأساسي — فاتح", "Primary color — light"],
  "appearance.accentLight": [
    "اللون المساند — فاتح",
    "Supporting color — light",
  ],
  "appearance.primaryDark": ["اللون الأساسي — داكن", "Primary color — dark"],
  "appearance.accentDark": ["اللون المساند — داكن", "Supporting color — dark"],
  "appearance.fontAr": ["الخط العربي", "Arabic font"],
  "appearance.fontEn": ["الخط الإنجليزي", "English font"],
  "appearance.radius": ["استدارة الحواف", "Corner shape"],
  "appearance.density": ["كثافة العرض", "Display density"],
  "contact.email": ["البريد الإلكتروني", "Email"],
  "contact.phone": ["رقم الهاتف", "Phone"],
  "contact.address": ["العنوان", "Address"],
  "sharing.descriptionAr": ["وصف الموقع بالعربية", "Arabic site description"],
  "sharing.descriptionEn": [
    "وصف الموقع بالإنجليزية",
    "English site description",
  ],
  "sharing.image": ["صورة المشاركة الافتراضية", "Default sharing image"],
  "announcement.enabled": ["تفعيل شريط الإعلان", "Enable announcement"],
  "announcement.messageAr": ["نص الإعلان بالعربية", "Arabic announcement"],
  "announcement.messageEn": ["نص الإعلان بالإنجليزية", "English announcement"],
  "announcement.ctaLabelAr": ["نص الرابط بالعربية", "Arabic link label"],
  "announcement.ctaLabelEn": ["نص الرابط بالإنجليزية", "English link label"],
  "announcement.ctaUrl": ["وجهة الرابط", "Link destination"],
  "announcement.variant": ["نوع الإعلان", "Announcement style"],
  "announcement.startAt": ["بداية العرض", "Start date"],
  "announcement.endAt": ["نهاية العرض", "End date"],
  "response.hours": [
    "مهلة متابعة الرد بالساعات (1–720)",
    "Response follow-up window in hours (1–720)",
  ],
  "track.forceLogin": ["فرض تسجيل الدخول", "Require sign-in"],
  "track.requestsMode": ["متابعة الطلبات", "Request tracking"],
  "track.inquiriesMode": ["متابعة الاستفسارات", "Inquiry tracking"],
  "track.linkTtlDays": [
    "صلاحية رابط المتابعة بالأيام",
    "Tracking link lifetime in days",
  ],
  "track.allowGuestAttachments": [
    "السماح بالمرفقات عبر رابط المتابعة",
    "Allow attachments via tracking links",
  ],
};
export const settingOptions: Record<string, Array<[string, string, string]>> = {
  "appearance.adminStyle": [
    ["light", "فاتح", "Light"],
    ["semi-dark", "شريط جانبي داكن", "Semi-dark sidebar"],
    ["dark", "داكن كامل", "Full dark"],
    ["colored", "ترويسة ملوّنة وشريط داكن", "Colored header & dark sidebar"],
  ],
  "appearance.mode": [
    ["light", "فاتح", "Light"],
    ["dark", "داكن", "Dark"],
    ["system", "تلقائي حسب الجهاز", "Follow device"],
  ],
  "appearance.fontAr": [
    ["ibm", "IBM Plex Sans Arabic", "IBM Plex Sans Arabic"],
    ["cairo", "Cairo", "Cairo"],
    ["tajawal", "Tajawal", "Tajawal"],
    ["system", "خط النظام", "System font"],
  ],
  "appearance.fontEn": [
    ["source", "Source Sans 3 — AdminLTE", "Source Sans 3 — AdminLTE"],
    ["ibm", "IBM Plex Sans", "IBM Plex Sans"],
    ["inter", "Inter", "Inter"],
    ["system", "خط النظام", "System font"],
  ],
  "appearance.radius": [
    ["adminlte", "AdminLTE (6px)", "AdminLTE (6px)"],
    ["square", "مستقيمة", "Square"],
    ["soft", "ناعمة", "Soft"],
    ["round", "أكثر استدارة", "Rounded"],
  ],
  "appearance.density": [
    ["adminlte", "AdminLTE", "AdminLTE"],
    ["comfortable", "مريحة", "Comfortable"],
    ["compact", "مضغوطة", "Compact"],
  ],
  "announcement.variant": [
    ["info", "معلومات", "Information"],
    ["warning", "تحذير", "Warning"],
    ["success", "نجاح", "Success"],
    ["brand", "لون الهوية", "Brand"],
  ],
  "track.requestsMode": [
    ["login_required", "تسجيل الدخول مطلوب", "Sign-in required"],
    ["link_view", "رابط للاطلاع", "View-only link"],
    ["link_reply", "رابط للاطلاع والرد", "View and reply link"],
    [
      "link_view_login_reply",
      "رابط للاطلاع والرد بعد الدخول",
      "View link, sign in to reply",
    ],
  ],
};
for (const [key, labels] of Object.entries(settingLabels)) if (key.startsWith("appearance.")) settingLabels[key.replace("appearance.", "adminAppearance.")] = labels;
for (const [key, options] of Object.entries(settingOptions)) if (key.startsWith("appearance.")) settingOptions[key.replace("appearance.", "adminAppearance.")] = options;
settingOptions["track.inquiriesMode"] = settingOptions["track.requestsMode"];
export const settingsErrors: Record<string, [string, string]> = {
  required: ["هذا الحقل مطلوب", "This field is required"],
  color: ["أدخل لونًا بصيغة #RRGGBB", "Enter a #RRGGBB color"],
  contrast: ["تباين الألوان غير كافٍ", "Insufficient color contrast"],
  url: ["أدخل رابط HTTP أو HTTPS صالحًا", "Enter a valid HTTP or HTTPS URL"],
  media: [
    "اختر صورة من مكتبة الوسائط",
    "Choose an image from the media library",
  ],
  png: ["اختر صورة PNG للأيقونة", "Choose a PNG icon"],
  email: ["أدخل بريدًا إلكترونيًا صالحًا", "Enter a valid email"],
  phone: ["أدخل رقم هاتف صالحًا", "Enter a valid phone number"],
  length: ["النص أطول من الحد المسموح", "Text exceeds the length limit"],
  choice: ["اختر قيمة من القائمة", "Choose a listed value"],
  date: ["أدخل تاريخًا صالحًا", "Enter a valid date"],
  dateOrder: ["يجب أن تكون النهاية بعد البداية", "End must not precede start"],
  ttl: ["أدخل عدد أيام بين 1 و3650", "Enter 1–3650 days"],
  hours: ["أدخل عدد ساعات بين 1 و720", "Enter 1–720 hours"],
};
