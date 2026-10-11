# مصفوفة التنفيذ والقبول — #70

المرجع: [Issue #70](https://github.com/so7ob/web/issues/70). خط الأساس `65dba5f99c46f76f7c70aa8ee283921077b22945`، والتنفيذ على `feat/70-audit-investigation`. هذه المصفوفة تخص التشغيل المحلي الاصطناعي؛ ليست شهادة نشر أو امتثال. نتائج الأوامر ونسخ التشغيل في [verification.md](verification.md).

المسارات المختصرة: **A** = `packages/server/src/audit/`، **C** = `packages/contracts/src/audit/`، **U** = `apps/web/src/components/admin/audit/`. اختبار **I** = `A/audit.integration.test.ts`؛ **B** = `tests/e2e/audit-investigation.spec.ts`؛ **O** = `tests/e2e/audit-operations.spec.ts`. الكتالوج المفصل يربط رمز كل حدث وحقوله المسموحة بمواقع التسجيل في [catalog.md](catalog.md).

| المتطلب / فجوة البداية | التنفيذ والملفات | الاختبار ودليل القبول | الحالة |
|---|---|---|---|
| 1: عزل المهمة وحفظ إصلاح #60 والتشخيص #64 | Issue وفرع من develop؛ لا تغييرات في Website/Rakim؛ عقود sparse و409 محفوظة | I للتعديلات المتزامنة؛ اختبارات الطلبات والمصادقة السابقة ضمن الحزمة الكاملة | منفذ ومتحقق محليًا |
| 2: الصفحة القديمة والفرع الفعلي | بناء مقارنة من git archive مثبت، وبناء مرشح مستقل، قاعدة وملفات وحساب تشغيل مستقل | صور before/after للغتين والعرضين؛ SHA/PID/المنافذ في verification | منفذ ومتحقق |
| 3: هوية حالية وJSON غير موحد | C/index.ts؛ A/writer.ts وreader.ts وredaction.ts؛ schemaVersion وrecordedAt وsource وcorrelation | I: تغيير اسم المستخدم وحذفه، سجل قديم معطوب، unknown، تنقيح متداخل | منفذ ومتحقق |
| المورد كان يُستنتج من المنفذ | مورد مطلوب صراحة في audit()؛ معرف الإنشاء النهائي قبل الإدخال؛ لا UPDATE لاحقًا | TypeScript لجميع مواضع الاستدعاء؛ اختبارات الطلبات والاستفسارات وrollback | منفذ ومتحقق |
| 4: نقص الأرشفة الفردية وتفاصيل الدفعة | admin/conversations.ts؛ حدث لكل مورد متغير وملخص batch مستقل | I: أرشفة استفسار ودفعة متعددة؛ عد الموارد والدفعات منفصل | منفذ ومتحقق |
| تغطية العمليات الموجودة | كتالوج رموز محدود، الكاتب يرفض الرموز غير المسجلة؛ المحادثات والمستخدمون والمحتوى والملفات والجلسات | اختبارات الخدمات الحالية + I + جدول التغطية أدناه؛ لا إنشاء لوظائف أعمال جديدة | منفذ؛ تحقق الخدمات شامل، وليس اختبارًا بصريًا مستقلًا لكل رمز |
| فتح التدقيق دون تسجيل كل polling | A/reader.access وAuditAccess: نافذة خمس دقائق للفاعل/المورد؛ تسجيل خادمي للبحث والتفاصيل والتتبع | B: قراءة API مباشرة وتكرارها؛ polling يعيد العدد وأحدث معرف فقط ولا يسجل وصولًا | منفذ ومتحقق |
| 5: نجاح الأعمال والتدقيق معًا | A/writer داخل QueryRunner نشط، AuditWork في المعاملة؛ قفل الموارد الموجود محفوظ | I: معاملتان، trigger يمنع الكاتب، rollback، no_change، حالة مكررة 409 | منفذ ومتحقق |
| محاولة الرفض لا تضيع مع rollback | API diagnostics يسجل محاولة مستقلة بعد الرد، بحد 128 عملية؛ fallback تشخيص منقح | اختبارات HTTP الرفض والمصادقة؛ حد فقدان محاولة عند موت العملية موثق في architecture | منفذ ومتحقق؛ ليس ضمان تسليم دائم للمحاولات بعد الرد |
| 6: فروق ذات معنى | A/redaction، C/display؛ missing/null/empty/redacted/unrecorded؛ ترتيب القوائم وحدود عمق/حجم ووسم الاختصار | I للأسرار والقوائم؛ B للفروق الفعلية؛ PDFs مطبوعة | منفذ ومتحقق |
| 7: بحث ومؤشرات حقيقية | A/query وreader: POST، إحصاءات مجموعة النتائج، حدود UTC، cursor موقع مرتبط بالمستخدم والفلاتر | I للـcursor/التوقيت؛ B للبحث والإحصاءات؛ قياس 100 ألف حدث وEXPLAIN | منفذ ومتحقق |
| الواجهة القديمة | U/audit-client، copy، tools: تبويبات حقيقية، جدول/بطاقات، فلاتر وشرائح وتفضيلات وعروض شخصية | B/O: AR/EN، RTL/LTR، 375/1280، axe، لوحة مفاتيح وEscape والتركيز | منفذ ومتحقق |
| تفاصيل JSON وحدها | Sheet بمعرف مباشر، before/after وحقول آمنة، تاريخ المورد والدفعة والتتبع، روابط مرخصة وطباعة | B/O وصور detail وprint؛ لا زر إعادة تنفيذ أو تراجع | منفذ ومتحقق |
| أخطاء الشبكة والسباق | AbortController + debounce 300ms + حارس الاستجابة؛ بيانات قديمة موسومة دون نسبتها لفلاتر جديدة | B: فشل تحديث وretry؛ مسارات أخطاء المشروع ضمن الحزمة الكاملة | منفذ ومتحقق |
| 8: متابعة لا تغيّر الدليل | AuditBookmark/Case/CaseEvent/CaseHistory؛ إذن مراجعة مستقل وإدارة قضية مستقلة؛ إغلاق بسبب | I: ملاحظة وإغلاق ومنع حذف وثبات صف الدليل؛ B: إنشاء متابعة من الواجهة | منفذ ومتحقق |
| 9: تنبيهات قابلة للتفسير | A/operations، AuditRule/Alert/AlertEvent، outbox؛ أربعة أنواع، disabled افتراضيًا، revision/cooldown/unique key وتجربة | I: نافذة أمنية وإعادة معالجة؛ O: منح دور إداري وتنبيه من الواجهة؛ large-reports.json | منفذ ومتحقق |
| 10: تفويض وتنقيح جميع الإسقاطات | أذون audit.* مستقلة؛ no-store؛ تاريخ الهوية لا ينضم إلى User؛ dashboard/user activity يستخدمان projection نفسه | I: سحب إذن قبل التنزيل، عزل العروض؛ B/live: رفض قائمة/تفاصيل/قضية/تقرير/صحة | منفذ ومتحقق |
| أسرار/حقن/تفاصيل تاريخية | allowlists قبل الحفظ والقراءة والتقرير؛ React escaping؛ SQL parameters؛ CSV formula escape؛ HTML escaped/CSP | I: أسرار متداخلة وJSON معطوب وCSV؛ O للطباعة؛ رفض مدخلات ضمن اختبارات الخدمات | منفذ ومتحقق |
| 11: Append-only عبر التطبيق وقاعدة التشغيل | إزالة FK وتحديثات AuditLog؛ أدوات توليد grants وفحص SI فقط؛ حساب migrations مستقل | runtime-smoke: UPDATE/DELETE/ALTER مرفوضة ومعاملة أعمال+INSERT تنجح ثم rollback؛ live بحساب مقيّد | منفذ ومتحقق محليًا؛ تجهيز الإنتاج متروك للمراجعة |
| الاحتفاظ كان غير مهيأ | AuditPolicy افتراضي null، dry-run، CLI مستقل أقصى 250، قفل مشترك مع holds ومراجعة revision | I: unconfigured/held/apply؛ maintenance.json بحساب صيانة منفصل: dry-run ثم حذف سجل واحد وحفظ الدليل المحمي؛ لا API حذف ولا مسح الكل | منفذ ومتحقق |
| سلامة ملفات الأدلة | manifest بمعرفات/عدد/bytes/SHA-256؛ أداة تحقق تدفقية | تنزيل التقرير الفعلي ومطابقة checksum، تقريران 100 ألف حدث | منفذ ومتحقق؛ checksum ليس إثبات أصل الأحداث |
| 12: OFFSET عميق وغياب القياس | ترتيب createdAt/id، keyset، فهارس مورد/مرجع/تتبع/خطأ، ملخصات خفيفة | performance-representative.json وreference-search.json | منفذ ومتحقق ضمن حجم القياس؛ بحث substring العام يتجاوز هدف 500ms |
| 13: تصدير حقيقي كامل | A/reports؛ queued/running/completed/failed/cancelled/expired؛ scope page/selected/all؛ RR snapshot واتصال واحد | I: معاملة قديمة تلتزم بعد اللقطة وتُستبعد؛ عدد مطابق؛ إلغاء/lease/انتهاء/سحب إذن | منفذ ومتحقق |
| CSV/JSON/طباعة عربية | streaming وملفات خاصة وحدود معلنة، تنزيل مصادق، HTML قابل للطباعة/PDF | B/O؛ تقريران 100 ألف حدث عبر عامل Node فعلي؛ إصلاح مسار DATA_DIR المخفي | منفذ ومتحقق |
| 14: صحة مستقلة عن نشاط الأعمال | probe إدخال ثم rollback، قياسات API/worker منفصلة، queue age/failures، unknown عند غياب القياس | I: writer failure/probe؛ live-acceptance: healthy من عمليتين؛ لا استنتاج من قلة الأحداث | منفذ ومتحقق |
| ترحيل قاعدة قائمة وتراجع آمن | migration إضافية، adapter v0، لا backfill تخميني؛ استعادة اصطناعية ثم forward recovery | upgrade.json يحفظ ID/createdAt/details؛ restore.json باستعادة فعلية وSSR/API/worker | منفذ ومتحقق محليًا |
| 15–17: حزم متكاملة وأدلة مراجعة | كود وخادم وواجهة وعامل واختبارات ووثائق، Issue ثم PR إلى develop | البوابات في verification، سيناريو القبول المتكامل، أدلة لا mockups | راجع سجل التحقق لآخر حالة CI وPR |
| توقيع خارجي/تخزين مستقل/إرسال خارجي | حدود ثقة ومسار توسعة موثق فقط، دون زر يوحي بتفعيلها | لا بنية مستقلة أو تفويض تفعيل متاح؛ لا ادعاء اختبار تكامل غير موجود | متبقٍ بعائق محدد ومشروط خارج النطاق المحلي |

## تغطية العمليات والصلاحيات

كل صف أدناه يحيل إلى الكتالوج لكل رمز وallowlist وموقع الاستدعاء؛ الاختبارات المذكورة تتحقق من عمليات الأعمال وقيودها. اختبار I يختبر عقد الكاتب والقارئ والتنقيح والمعاملة، وليس بديلًا عن اختبارات الخدمات.

| العمليات الموجودة | موضعها / عائلة الأحداث | التفويض عند التنفيذ | الاختبار |
|---|---|---|---|
| إنشاء طلب/استفسار | business/submissions؛ request/inquiry.submitted | عقد الإدخال العام، CSRF/rate limit، هوية جلسة إن وجدت | submissions.integration |
| حالة/أولوية/تعيين/أرشفة/استعادة ودفعات | admin/conversations؛ request/inquiry.* وbatch.completed | requests.status/assign/archive؛ inquiries.status/assign/archive | I، portal.integration، B، اختبارات request mutations السابقة |
| رد/ملاحظة/مرفق وتعديل/إلغاء العميل | admin/conversations، business/requests، files/service | ملكية العميل أو requests.reply/internal_notes وinquiries.reply؛ صلاحيات الملفات القائمة | portal.integration، files.integration، B |
| دعوة/تعليق/تفعيل/تعديل/دور | admin/users؛ user.* | users.create/update/suspend/roles مع منع تعطيل آخر مسؤول | users.integration، I، O |
| دخول/فشل/خروج/كلمة مرور/إبطال جلسات/دعوة | auth/service، business/account | جلسة صاحب الحساب أو تدفق رمز مفرد الاستخدام؛ المجهول لا يُنسب للحساب المستهدف | auth.integration، claims.integration، test:auth، I |
| صفحة ومسودة ونشر وجدولة واستعادة | admin/pages/publication؛ page.* | pages.edit/publish/restore/delete؛ العامل ينفذ مهمة مجدولة مثبتة | pages.integration، publication.integration، test:cms-boundaries |
| قوالب ووسائط وقوائم وإعدادات وردود محفوظة | admin/templates/operations، files/service | pages.edit، media.upload/manage، menus.manage، settings.manage، إذن الرد القائم | templates.integration، media-library.integration، operations.integration |
| تصدير أعمال/تشخيص | conversations وdiagnostics/store | requests.export/inquiries.export؛ diagnostics.view/manage | portal/diagnostics integration واختبارات المتصفح السابقة |
| قراءة التدقيق والتقارير والمراجعة والقواعد والسياسة | A/* | audit.view + الإذن المستقل للعملية؛ ownership للتقارير والعروض؛ super_admin شامل | I/B/O، runtime smoke، live acceptance |

## حدود مقصودة يجب أن تبقى ظاهرة

- لا توجد مؤسسات في نموذج المشروع؛ القراءة المنقحة على مستوى المنصة. لا تمنح روابط الموارد صلاحية إضافية.
- التاريخ القديم ناقص بطبيعته: unknown ليست success، ولا يُعرض الدور الحالي بوصفه تاريخيًا.
- التصفح حي؛ التقرير وحده يستخدم لقطة ثابتة. حدود التقارير تفشل بوضوح دون اقتطاع صامت.
- الأدلة الكبيرة تُلخص بمراجعات وحقول آمنة، ولا تُخزن نسخة من الصفحة أو المحادثة. الإعدادات تسجل المفاتيح المتغيرة وبيانات السياسة الآمنة، لا جميع قيم الإعدادات العامة.
- مراجعة القضية لا تعني إصلاح عطل برمجي. التنبيه تفسير قاعدة حتمية، لا تقدير ذكاء اصطناعي.
- قاعدة مشتركة لا تحمي ضد مسؤول قاعدة البيانات. لا ادعاء امتثال أو exactly-once أو استعادة كارثة خارج هذا المضيف.
