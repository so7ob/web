# كيف يعمل سُحُب التقنية — شرح البنية ومسار طلب الخدمة

هذا تحليل للكود، مع مخرجات محلية قابلة للمراجعة، بتاريخ 2026-10-09 (Asia/Aden). ليس شهادة قبول وظيفي أو أمني أو تشغيلي، ولا يتضمن نشرًا أو تغييرًا في التطبيق.

- المستودع المحلي: `/root/So7ob/web`، وorigin للجلب والدفع: `https://github.com/so7ob/web.git`.
- الفرع: `develop`؛ Commit: `e84fe1b3c3f6b2fd9bf2c79c0a08e53458e5dae3`. لم يُجلب تحديث من GitHub؛ هذا وصف للنسخة المحلية المثبتة، لا ادعاء بأنها أحدث نسخة بعيدة.
- قبل العمل كانت `.agents/skills/archify/` و`skills-lock.json` غير متتبعتين. حُفظتا دون تعديل. مصادر التطبيق المستشهد بها لم تكن معدلة؛ Archify يتحقق من الأدلة مقابل bytes الـCommit.
- لم تُنشأ Issues أو PRs أو commits، ولم يُكتب إلى Website أو Rakim. الإضافات المحلية هنا هي المخططات وأدلة الشرح والتحقق.

## اختيار المخطط والمخرجات

الأنسب **Architecture** لحدود التشغيل ومسؤوليات المكونات، و**Sequence** لتوضيح ترتيب الطلب والتحقق والمعاملة والرد. التسلسل مقسم إلى ثلاث لوحات مترابطة كي تبقى الأسهم والتسميات مقروءة؛ لا تمثل أنظمة مختلفة.

1. [مخطط البنية الرئيسي](../../.archify/architecture-so7ob-20261009-230021/so7ob.html).
2. [التسلسل: إنشاء الطلب](../../.archify/sequence-so7ob-request-20261009-230021/creation/creation.html).
3. [التسلسل: المعالجة والرد](../../.archify/sequence-so7ob-request-20261009-230021/processing/processing.html).
4. [التسلسل: البريد ومتابعة العميل](../../.archify/sequence-so7ob-request-20261009-230021/followup/followup.html).

هذه HTML مستقلة بمخططات SVG تفاعلية وأدلة مصدر قابلة للفتح. التسميات والشرح بالعربية مع المصطلحات التقنية؛ أدوات العارض الثابتة ووسم لغة صفحته تستخدم fallback إنجليزيًا. المخططات بلا حركة تلقائية. المتصل استدعاء متزامن؛ الوردي المتقطع تحقق متزامن، والبنفسجي المتقطع عمل خلفي، والرمادي المتقطع نتيجة في التسلسل؛ الألوان تميز الواجهة والتحقق والخدمات والتخزين والخارج.

## البنية المنفذة في الكود

المشروع npm Workspaces وTypeScript. الواجهة `apps/web` لها build للمتصفح وbuild لـSSR باستخدام React/Vite/React Router. تطبيق `apps/api` ينشئ NestJS فوق Express، يسجل Controllers ويحقن الخدمات، ويحمّل renderer الخاص بـSSR داخل **نفس عملية الخادم**. `apps/worker` عملية Node مستقلة؛ لا يوجد اتصال مباشر بين المتصفح وMariaDB.

عند فتح صفحة، يقرأ الخادم الجلسة ثم يطلب `PublicView` من `PublicService` مباشرة، ويستدعي `entry-server.render` لإرجاع HTML وبيانات تهيئة مهربة بأمان. المتصفح ينفذ Hydration. التنقل اللاحق يستدعي `GET /api/v1/public/view?path=...`، وعمليات النماذج والحساب والإدارة تستخدم REST. لا يوجد HTTP داخلي مفترض بين SSR وAPI.

| العلاقة | دليل الكود الحالي |
|---|---|
| build المتصفح وSSR؛ Hydration ثم جلب بيانات التنقل | `apps/web/package.json:7–8`، `apps/web/src/entry-server.tsx:1–11`، `apps/web/src/entry-client.tsx:15–32` |
| تركيب NestJS والخدمات؛ SSR يرجع HTML وPublicView | `apps/api/src/main.ts:84–170,175–208,315–380` |
| `/ar` و`/en` للموقع؛ `/{locale}/account` و`/{locale}/admin`؛ تحويلات الدخول وصلاحيات القسم | `apps/api/src/public.service.ts:75–99,176–229` |
| واجهة API لبيانات العرض تعيد استخدام الجلسة وPublicService | `apps/api/src/public.controller.ts:14–17` |
| جلسات مخزنة في الخادم مرتبطة بالمستخدم والدور؛ إلغاء وانتهاء الجلسة | `packages/server/src/auth/service.ts:72–81` |
| Cookie من نوع HttpOnly؛ Secure في الإنتاج؛ سياسة Origin/CSRF | `apps/api/src/auth/policy.ts:12–43` |
| AccountGuard ثم تفويض حسب المسار/الخدمة؛ PermissionGuard ليس الحارس الوحيد | `apps/api/src/business/controller.ts:46–85`، `apps/api/src/business/permission.guard.ts:20–29` |
| TypeORM DataSource وEntitySchema وQueryRunner/SQL؛ mysql2؛ MariaDB | `packages/server/src/database/data-source.ts:13–44`، `packages/server/package.json:12–19`، `packages/server/src/business/persistence.ts:6–17` |
| ترحيلات صريحة؛ لا synchronize ولا migrationsRun تلقائيًا؛ فحص schema عند بدء التشغيل | `packages/server/src/database/data-source.ts:31–44`، `apps/api/src/main.ts:175–177` |
| خدمات العملاء والطلبات والاستفسارات والإدارة والمستخدمين وCMS والملفات مسجلة فعليًا | `apps/api/src/main.ts:84–170` |

`packages/contracts` مكتبة مشتركة للأنواع والتحقق وقواعد الصلاحيات؛ وجودها في المتصفح لا يمنحه سلطة. الخادم يعيد تطبيق القواعد. كيانات التخزين وبيانات الاتصال توجد في `packages/server`، والوصول الفعلي في المسار المدروس غالبًا SQL بمعاملات عبر TypeORM، وليس سلسلة افتراضية من ORM repositories. العقود ليست خدمة شبكة ولا مخزنًا.

### حدود البيانات والملفات

المحتوى العام يختار حقول النشر فقط ويتحقق من visibility والأدوار؛ مسودات CMS لا تدخل PublicView العام (`apps/api/src/public.service.ts:231–280`). تفاصيل الطلب تتحقق من الملكية أو صلاحية عرض الطلبات، وتحجب `internal_note` ومرفقاتها عن العميل (`packages/server/src/business/requests.ts:97–172`، `packages/contracts/src/requests.ts:46–49`).

الملفات الثنائية في `DATA_DIR/uploads` عبر `FileStore`، وبياناتها الوصفية في MariaDB. تنزيل المرفق يمر بجلسة مستخدم أو Track capability صالحة وفق السياسة، ثم تحقق المورد قبل فتح الملف. الوسائط `/api/media/:id` عامة على نحو مستقل. تستخدم المرفقات `private, no-store` و`nosniff`، وتتحقق طبقة التخزين من المسار والروابط الرمزية. الأدلة: `apps/api/src/files/controller.ts:123–179`، `packages/server/src/files/service.ts:135–184`، `packages/server/src/files/storage.ts:12–35,47–118`.

**حد واقعي في التنفيذ:** فصل الحزم لا يثبت أن كل الاستجابات DTO منتقاة الحقول. `RequestService.detail` يقرأ `SELECT *` ثم ينشر `...request` في الاستجابة (`requests.ts:98–100,135–172`). نموذج `ProjectRequest` يتضمن `descriptionHash` و`clientIpHash` و`userAgent` (`database/models.ts:134–152`)، وتُعاد بعض صفوف الرسائل والمرفقات أيضًا. لذلك لا يدعي المخطط اكتمال تقليل بيانات الاستجابة أو اجتياز قبول حماية البيانات. هذه ملاحظة من الكود الحالي؛ لم تُختبر باستجابة تشغيلية ولم يُحدد هنا تاريخ إدخالها.

### العامل والخدمات الخارجية

يحفظ التطبيق المهام في جداول `MailJob` و`WebhookJob` و`FileCleanupJob` داخل MariaDB. العامل ينفذ Polling ويستخدم `FOR UPDATE SKIP LOCKED` وlease tokens لتملك المهمة. حفظ المهمة متزامن مع معاملة الأعمال حيث يُستدعى enqueue؛ تنفيذها الخارجي لاحق وغير متزامن.

- البريد: حمولة مشفرة، dedupe key، `EmailLog` للبيانات الوصفية، heartbeat وحالات `sent/retry/failed/uncertain`. التعطل بعد بدء إرسال غير محسوم لا يؤدي إلى إعادة إرسال تلقائية. `packages/server/src/queue/mail-queue.ts:10–62`، `packages/server/src/queue/worker.ts:16–49`.
- SMTP عبر Nodemailer؛ الهوية الفعلية للمزود واتصاله غير متحققين. `queue/worker.ts:5–14,37–48`.
- Webhook: إسناد مشروط بـ`NOTIFY_WEBHOOK_URL` عند إنشاء الطلب، وتنفيذ HTTP POST بالعامل؛ لا يُفترض مزود بعينه. `business/submissions.ts:148–164`، `queue/webhook.ts:219–256`.
- تنظيف الملفات: فحص المراجع داخل معاملة قبل الحذف وإعادة المحاولة الآمنة. `files/cleanup.ts:10–74`.
- النشر المجدول: يفحص العامل `Page.scheduledPublishAt` ويشغّل `runDue`؛ ليس MailJob ولا خدمة Cron خارجية مفترضة. `apps/worker/src/main.ts:14–22`، `admin/publication.ts:211–242`.
- الإشعارات الداخلية سجلات `Notification` تُقرأ عبر API، وليست بريدًا ولا Push/WebSocket في المسار المدروس. `business/persistence.ts:33–55`، `apps/api/src/business/controller.ts:141–152`.

## السيناريو العملي: عميل مسجل ثم موظف مخوّل

1. يرسل النموذج `POST /api/requests`. هذا مسار عام يقبل زائرًا أيضًا؛ يطبق SubmissionGuard سياسة الكتابة ويقرأ الجلسة إن وجدت. يتحقق DTO وخدمة `validateProjectRequest` من البيانات، ثم honeypot/timing وRateLimit. `clientId` من الجلسة وحدها، بينما بريد التواصل والاسم من المدخلات. الدليل: `apps/web/src/components/form/project-request-form.tsx:174–205`، `apps/api/src/business/controller.ts:46–104`، `apps/api/src/business/dto.ts:18–50`، `packages/server/src/business/submissions.ts:44–97`.
2. داخل معاملة: قفل للتكرار، حفظ `ProjectRequest` وAudit، إشعارات للطاقم النشط ذي أدوار super_admin/ops_manager/support، ثم MailJob لهم، وWebhookJob إن ضُبط. EMAIL_DEV_MODE خارج الإنتاج يسجل بريد الطاقم فقط. فشل المعاملة يتراجع عن هذه الكتابات. بعد COMMIT يحاول إصدار TrackLink وبريده في معاملة لاحقة؛ فشل إصدار الرابط يعيد `trackUrl:null` مع بقاء الطلب. النتيجة `201 {ok,ref,trackUrl}`. الأدلة: `business/submissions.ts:68–168,265–271`، `business/persistence.ts:33–55`، `track/service.ts:49–65`، `auth/persistence.ts:7–10`.
3. يفتح الموظف `GET /api/admin/requests/:id` بعد الجلسة وصلاحية `requests.view.all`. يمكنه نقل `new → in_review` عبر `PATCH /api/admin/requests/:id` مع `requests.status` و`canTransition`. تحفظ المعاملة الحالة و`RequestStatusEvent` ورسالة system وAudit وإشعار العميل. تغيير الحالة لا يستدعي بريدًا في هذا الفرع. الأدلة: `apps/api/src/admin/operations.controller.ts:219–237`، `admin/conversations.ts:199–204,338–412`.
4. **واجهة الإدارة ترسل رد الطلب إلى** `POST /api/account/requests/:id/messages`، وليس إلى نقطة نهاية إدارية مخترعة. AccountGuard ثم تحقق الوصول و`requests.reply`، ونص غير فارغ، وقفل صف الطلب. يحفظ `RequestMessage` ووقت رد الموظف وAudit وNotification للعميل. محاولة إسناد بريد الرد داخل SAVEPOINT يمكن أن تفشل دون إلغاء الرد. المستلم بريد التواصل المخزن في الطلب؛ ليس بالضرورة بريد الحساب. الدليل: `apps/web/src/components/admin/requests/request-detail-client.tsx:207–234`، `business/requests.ts:274–395`، `track/notify.ts:8–16`.
5. العامل يرسل المهام المتاحة بعد الحفظ. موضعه في اللوحة الثالثة للتوضيح؛ قد يعمل بين أي خطوتين بعد COMMIT ولا تنتظره استجابة API. قبول SMTP لا يثبت وصول البريد لصندوق العميل.
6. يقرأ العميل `GET /api/account/notifications` ثم `GET /api/account/requests/:id`. تُراجع الجلسة والملكية، ويعاد الطلب وردوده العامة وتاريخ الحالة، ويحدّث `clientReadAt` عند الحاجة. **الرد وحده لا يحول الحالة إلى responded**؛ المثال يبقيها in_review إلى أن تُغيّر صراحة. الأدلة: `apps/api/src/business/controller.ts:141–152,171–189`، `business/requests.ts:97–172,320–339`.

الفشل الأساسي: `400 invalid/empty`، `401 unauthorized` لمسارات الحساب، `403 bad_origin/csrf/forbidden`، `404 not_found`، `409 duplicate` لطلب مماثل خلال 30 دقيقة أو `invalid_transition`، و`429 rate_limited`. رد العميل على closed/cancelled يرفض بـ`409 locked`؛ هذا الشرط خاص بالعميل. تكرار نص آخر رسالة من نفس الكاتب خلال خمس دقائق يعيد الرسالة الموجودة بدل إضافة أخرى (`business/requests.ts:293–310`).

## حالة الأدلة والمراجع القديمة

**منفذ:** علاقات التشغيل والخدمات وقواعد السيناريو أعلاه، مدعومة باستدعاءات وقراءات وكتابات فعلية في النسخة المثبتة. **موثق فقط في هذا الفحص:** قبول المظهر والأداء بتاريخ 2026-10-06 ونجاح الاستعادة المحلية، وتأجيل الاستعادة خارج المضيف؛ هذه تصريحات README الحالي وليست نتائج أعيد إثباتها هنا. **غير متحقق:** إعداد الإنتاج، إرسال البريد الحقيقي، هدف Webhook، أحدث HEAD البعيد، القبول الوظيفي الكامل والتكافؤ مع Website.

README الحالي، لا مذكرة تاريخية، يصف الترحيل بأنه جزئي وقيد المراجعة وليس إصدار استبدال (`README.md:3–8`). يسجل baseline لـWebsite عند `5321b7fd11db421c83290b262f276811e5f04e5f` ومقارنة مثبتة عند `dddf8cd00a19cf7d562f503549f4c000109057d1`، وRakim كمرجع معماري عند `cae0950bac45d97971bd3766c8c34f9869a856af`. لم تُفتح تلك المستودعات أو تُقارن من جديد. الأرشيف `reference/website-import` تاريخي وليس مصدر Runtime؛ التطبيق يبنى من apps/packages (`reference/README.md:1–7`).

## التحقق في هذه الجلسة

اجتازت المخططات الأربعة finalize: validate وdeliver وstrict provenance check وbrowser-check. الإيصالات النهائية `*.finalize-summary.json` داخل مجلد `final-review` الخاص بكل HTML تحتوي SHA-256 للمواصفة وللملف وإيصال المتصفح. يجمعها [إيصال التسليم](../../.archify/architecture-so7ob-20261009-230021/handoff.json). بدأ الاكتشاف الآلي دون Chrome ثم أُعيد الفحص باستخدام Chromium headless المثبت محليًا؛ النتائج النهائية وحدها هي المعتمدة.

نجح التقاط نسختي light/dark عند 1440×900 و2048×1320 لكل مخطط. فُحصت بصريًا لقطات النسخة النهائية: البنية dark عند 1440، الإنشاء light عند 1440، المعالجة light عند 2048، والمتابعة dark عند 1440. العلاقات والتسميات ظاهرة؛ مخطط البنية طويل ويتطلب تمرير الصفحة لرؤية الخدمات الخارجية والبطاقات. لم تُراجع كل لقطة يدويًا، ولا تعني هذه المعاينة قبول إتاحة شاملًا.

فحص إضافي للعارض، مستقل عن فحص Archify، غطى المخططات الأربعة بعرضي 375 و1280، في LTR الافتراضي وفي محاكاة RTL عبر DOM (ليست ترجمة جديدة للعارض). لم يظهر تجاوز أفقي في 16 حالة. وصل Tab إلى عناصر التحكم وعناصر الرسم؛ هذا فحص أولي للتنقل لا اختبار شامل لكل تفاعل. كشف axe أربعة أنواع مخالفات في قالب العارض: `heading-order` و`landmark-one-main` و`nested-interactive` و`region`. لذا **لم يجتز العارض قبول axe**؛ لم تُخفف القواعد أو تُعدل حزمة المهارة لإخفاء النتيجة. [الدليل التفصيلي](../../.archify/architecture-so7ob-20261009-230021/checks/viewer-accessibility.json).

تم تشغيل أوامر المستودع المطلوبة دون تحميل إعدادات قاعدة بيانات فعلية، ودون تهيئة قاعدة جديدة لهذا الشرح:

| الفحص | النتيجة |
|---|---|
| `npm run lint` | نجح؛ ESLint مستقل |
| `npm run typecheck` | نجح |
| `npm test` | exit 1؛ نجحت 24 suite و687 اختبارًا؛ فشلت 17 suite عند التحميل لغياب إعداد MariaDB اختبار معزولة |
| `npm run build` | نجح |
| `npm run test:e2e` | exit 1؛ رفض البدء دون قاعدة `so7ob_*_test` محددة صراحة |
| `npm run test:infra` | نجح؛ فحص قوالب/صياغة محلي لا نشر |
| `git diff --check` | نجح |

سجلات الأوامر في [checks](../../.archify/architecture-so7ob-20261009-230021/checks/results.json). لا تعني الفحوص الناجحة تكافؤًا أو جاهزية إنتاج. لم تُعدّل الاختبارات أو تخفف شروطها. حالات JSON/HTML الأولية غير المجتازة محفوظة في مجلد الطلب؛ روابط التسليم أعلاه وحدها تعيّن المخرجات النهائية.
