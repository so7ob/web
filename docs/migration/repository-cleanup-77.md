# تنظيف المستودع واستقلال web — #77

Issue: [#77](https://github.com/so7ob/web/issues/77). الفرع `refactor/77-repository-cleanup` من develop؛ لا اعتماد متراكم ولا دمج أو نشر تلقائي.

نقطة البداية: main `2a6c37b9c7bcd21cc690119da1ac523c4451748a`، وdevelop `aea86246105df492b6793f8aa0814f7a853d83b4` بالشجرة نفسها. كانت الشجرة نظيفة، ولا Issue أو PR مفتوح للنطاق. تحقق origin fetch/push وGitHub `nameWithOwner=so7ob/web` قبل كل كتابة بعيدة. لم تُلمس Website/Rakim أو فروع محمية أو إعدادات المستودع أو أعمال محلية سابقة.

## القرارات ودليل الاستخدام

| المسار / الوظيفة | المستهلكون والدليل | القرار | التحقق |
|---|---|---|---|
| `reference/`، `reference-relocation.json` | اختبار استقلال قديم يطابق 338 بصمة؛ CI يختبر commit أرشيفًا | حذف الأرشيف كاملًا وخريطة بصماته بقرار المالك؛ حفظ الأصل والحقوق وSHA في source-provenance؛ التاريخ باقٍ في Git | استقلال + checkout نظيف |
| أدوات `reference-paths`، fixture/capture/compare/benchmark-reference/extract-source-schema/generate-block-contracts/inventory-refresh | تتبع AST وrg أظهر أنها تحمّل Prisma أو snapshots تحت .migration/reference أو تقارن خادمين قديمين؛ ليست ضمن أوامر الصيانة الحالية | حذف 22 أداة انتهت مرحلتها؛ لا بديل مصدر قديم ولا مولّد توقعات من المنتج | lint، استقلال، اختبارات العقود |
| CI `reference` | checkout ثابت لـa2dc18c، setup-bun، Bun/Next build | إزالة هذه المهمة وحدها؛ تسمية Web quality checks. كل فحوص المنتج ومهارات UI/UX محفوظة | CI الحالي + كل أوامره محليًا |
| `tools/test/runtime-independence*` | apps/packages/tools/tests/ops/config/CI/npm lock | تحديث بدل حذف؛ فحص AST للاستيراد والتصدير وdynamic import وCommonJS والـalias والمكونات المركبة للمسار؛ منع إطار Next/Prisma/Bun والمصدر الخارجي وcheckout CI تاريخي، مع حالات رفض إيجابية وسلبية | `test:independence`، 3 حالات سياسة تغطي عدة طرق تحميل |
| `docs/migration/api-inventory.json` | API/OpenAPI وrole-contracts في E2E | نقل بايتات ثابتة إلى `tests/fixtures/api-inventory.json` وتحديث القارئين | E2E، بصمة مطابقة |
| `legacy-size-ranking.json` | CMS stress: 27 نوع كتلة، 60 كتلة قصوى، توقعات ترتيب/أحجام | نقل بايتات ثابتة إلى tests/fixtures وتحديث smoke وسجل oracle؛ لا تغيير توقع أو حد | CMS boundaries، بصمة مطابقة |
| source-block-contracts، public-content، auth-axe-baseline، schema-v1/v2 وSQL fixtures | عقود خصائص/تطبيع؛ بيانات متصفح؛ قائمة axe فارغة؛ نقل v1/v2 | إبقاء بقيمها الأصلية؛ توثيق القراء والبصمات في tests/fixtures/README | الوحدة/MariaDB والمتصفح |
| `public/` الجذري | 8 أسماء مطابقة بايتًا لأصول apps/web/public؛ مستهلكه الحالي الوحيد حزمة الاستعادة | حذف التكرار؛ إبقاء **كل الأصول العشرة** في apps/web/public، بما فيها icon.png وapple-icon.png المختلفان بالأسماء | جميع الأصول عبر HTTP من release مستعاد |
| `operational-restore.mjs` | Nest يخدم apps/web/public وdist/assets، بينما tar القديم ينقل public الجذري | تضمين apps/web/public؛ فحص البايتات لكل الأصول وCSS وكل woff2، ومنع أي symlink خارج الإصدار المستعاد | الاستعادة الكاملة، عامل مستعاد، ملفات وجلسات وطابور ومفاتيح |
| `components/home` (7)، `components/pages` (6)، `hooks` (2)، UI غير المستخدمة (25) | رسم اعتمادات AST من entry-client/entry-server **وكل اختبارات وأدوات** المستودع، exports وlazy imports؛ routes في app.tsx وCMS PageRenderer/TreePageRenderer؛ لا file glob يحمّلها | حذف 40 ملفًا؛ عدم حذف شاشات أو renderer أو route. الواجهة العامة الحالية منشورة من CMS | build، الوحدة، E2E ar/en 375/1280، كيبورد وaxe |
| 28 اعتمادًا مباشرًا | AST وrg عبر جميع workspaces/tools/tests وCSS/config؛ مراجعة plugins/CLI/peers؛ أصبحت بلا استيراد بعد حذف UI أو كانت موروثة أصلًا | `npm uninstall` بالإصدارات المثبتة؛ 183 مدخل حزمة أقل في القفل؛ إبقاء next-themes المستخدم، tw-animate-css وVite/Tailwind/TypeORM وأدوات CLI | npm ci، lint/typecheck/build/full tests؛ لا تغيير إصدارات الحزم الباقية |
| `packages/server/src/database/migrations`، `src/migration` وأدوات smoke/benchmark الحالية | data:backup/recovery-check/transfer؛ اختبارات bcrypt/records/ownership/restart؛ worker/auth/webhook/CMS/files؛ benchmark المحادثات وupgrade v2 | تصحيح تجربة upgrade v2 لتطبق prefix v1 ثم جميع migrations التالية بالترتيب المحمي، وفحص خمس migrations صراحةً وبيانات v1 كاملة؛ إبقاء **كل ترحيلات قاعدة البيانات** وكل وظيفة صيانة حالية، بما فيها استيراد SQLite بمدخلات المشغل دون التطبيق القديم | MariaDB + جميع smoke/restore + v1/v2 tests |
| `.agents`، skill by skill | Archify يعيد توليد مخططات سُحُب، tests تستخدم أمثلته؛ ui-ux-pro-max في CI؛ أدوات brand/design-system/design/banner/slides/ui-styling من المالك ومترابطة | إبقاء الثماني مع أسبابها في .agents/README؛ لا دليل انتهاء وظيفة الأدوات المترابطة. skills-lock لم يتغير | Python UI/UX offline contracts؛ عدم إدخالها للـruntime |
| `.archify` | HTML/source/receipts سُحُب مرتبطة بالتوثيق؛ agent examples لا تصف المنتج؛ صور final-review مكررة SHA-256 | حذف مجلدي أمثلة الوكلاء وتقاريرهما المنتهية؛ حذف صور مكررة وcandidate نسخة مطابقة؛ تحديث روابط 4 galleries إلى الصور نفسها في المسار canonical؛ إبقاء مخططات سُحُب والأصل وcanonical captures وreceipts | روابط الفهرس ومطابقة البايتات قبل حذف التكرار |
| docs source/reports/screenshots/verification وفهارس import/refresh/file-map وcontinuation prompt | تاريخ Website القديم؛ لا قارئ اختبار حالي بعد فصل fixtures؛ prompt يأمر باستئناف النقل وانتهى | حذف المصدر المنسوخ وفهارسه وتقارير/صور تدقيق المصدر، دون أرشفة جديدة؛ روابط Git مثبتة للأصل والحقوق. أدلة قبول web وfinal-code-parity وaudit-70/72 باقية | بحث القراء والروابط؛ docs/README يفصل الحالي عن التاريخ |
| مخرجات البناء والكاش | لا dist/tsbuildinfo/log/test-results متتبعة خطأً؛ نتائج القبول ليست caches | لم تُحذف ملفات محلية أو بيانات/رفع/نسخ قائمة؛ تجاهل Python bytecode أيضًا | status قبل/بعد + diff check |

الاعتمادات المباشرة المحذوفة: @hookform/resolvers، @reactuses/core، @tanstack/react-query/table، Radix aspect-ratio/avatar/collapsible/context-menu/hover-card/menubar/navigation-menu/progress/separator/toast/toggle/toggle-group، embla-carousel-react، input-otp، react-day-picker، react-hook-form، react-markdown، react-resizable-panels، react-syntax-highlighter، recharts، tailwindcss-animate، uuid، vaul، zustand. `@radix-ui/react-slot` بقي اعتمادًا مباشرًا لازمًا لـbutton/sheet بنسخته المقفلة الموجودة أصلًا 1.2.4.

لم تُحذف أصول عامة متفردة أو snapshots قبول web اعتمادًا على غياب استيراد نصي. بقيت صور CMS والأصول والخطوط، ومكوّنات UI المستخدمة، والترجمات وهوية وروابط المنتج. أدلة التاريخ تشير لنسختها وقت التشغيل ولا تُعرض كتأكيد للنسخة الحالية.

## الأساس قبل التغيير

`lint` و`typecheck` و`test:independence` ناجحة على الشجرة الابتدائية؛ الاستقلال القديم تحقق من 2429 import و338 ملف أرشيف. `npm test` على MariaDB 10.11.18 جديدة: **49 ملفًا / 895 اختبارًا ناجحًا**. البناء على develop@aea8624 نجح والشجرة clean؛ build-info يثبت SHA وdirty=false.

محاولة تصوير اختيارية للخط الأساسي رُفضت بـHTTP 500 لأن harness صدّر NODE_ENV=test إلى Vite build ثم شغّل API production (jsxDEV غير متوفر في React production). هذا خطأ إعداد الفحص، لا نتيجة مقارنة بصرية مقبولة ولا عيبًا مثبتًا للمنتج. التحقق النهائي يبني مع NODE_ENV غير مضبوط كما في CI؛ لا تعديل لأداة المنتج أو اختباراته لتجاوز المحاولة.

## إثبات الاستقلال ونتائج النسخة

الأدلة الموجزة وبصمات السجلات في [evidence/repository-cleanup-77.json](evidence/repository-cleanup-77.json). كل الفحوص الكاملة أدناه نُفذت على worktree نظيف عند **A = baadb6840adf5efc64eff5fbbf07b74fe8c6224e**، وتحديث تجربة الترقية نُفذ مرة أخرى داخل worktree عند **B = 48313a1003c68fdae921444223c619713fd496a6**. لم تتغير apps/packages/tests أو عقود npm/lock أو أدوات الاستقلال بين A وB؛ تختلف الوثائق وروابط gallery وتجربة الترقية فقط. CI سيشغّل أيضًا تجربة الترقية الجديدة على قاعدة مستقلة، وتُذكر نتيجته الفعلية في PR عند رصدها؛ لا ادعاء نجاح CI من النجاح المحلي.

النسخة النظيفة: `/root/So7ob/web/.migration/repository-cleanup/checkout`. لا reference/ ولا .migration/reference ولا .env أو source checkout خارجي داخلها؛ node_modules نتيجة npm ci وليست symlink لبيئة المطور. الإعداد والأوامر في [docs/testing](../testing.md). MariaDB **منفصلة بالكامل** على loopback:33777، بحد packet=256MiB، وقواعد جديدة للوحدة والصيانة والمتصفح والتهيئة والترقية؛ لا تعديل لمثيل 3306 أو بياناته. لم تُنسخ أي إعدادات مطور أو أسرار أو بيانات قائمة.

| الأمر | النسخة | النتيجة الفعلية |
|---|---|---|
| npm ci | A | 0؛ 513 حزمة مثبتة من القفل، دون أي تغيير إصدارات للحزم المتبقية |
| npm run lint / typecheck | A ثم B | 0 لكليهما؛ ESLint مستقل |
| npm test | A | 49 ملفًا، **895 اختبارًا ناجحًا** |
| npm run build | A ثم B | 0؛ build-info clean SHA، NODE_ENV غير مضبوط كما في CI |
| npm run test:independence | A ثم B | 0؛ 3 حالات سياسة، 459 مصدرًا و2618 import و30 إعدادًا؛ لا قراءة أرشيف |
| npm run test:e2e | A | **240 ناجحة**، 0 فشل/skip/flaky/retry؛ ar/en وRTL/LTR و375/1280 وكيبورد وaxe ورحلات الحالة/الأولوية والردود والأدوار والملفات والمحرر |
| npm run test:infra | A | 0؛ Nginx/TLS/systemd syntax فقط، دون تشغيل أو نشر |
| npm run test:worker / test:file-worker / test:webhook / test:auth | A | 0 لكل أمر؛ SMTP/Webhook محليان وحالات رفض وتزامن وuncertain دون إعادة إرسال |
| npm run db:check-cms / test:cms-boundaries | A | 0؛ 300000/300001 UTF-8 وحد 160MiB وطلبات متزامنة 200/409 وأحجام 27 نوعًا ونسختي اللغة والنشر/versions |
| npm run test:restore | A | 0؛ release مستقل، جميع الأصول العشرة وCSS وكل الخطوط بالبايتات نفسها؛ جلسات وملفات ومفاتيح وطابور ورفض overwrite/post-open |
| python3 -B -m unittest discover -s .agents/skills/ui-ux-pro-max/scripts/tests | A | **153 ناجحة** دون skips؛ خطوة CI باقية |
| node --import tsx tools/migration/upgrade-source-v2-smoke.ts | B | 0؛ بيانات v1 الأصلية ومعرّفاتها محفوظة، 51 جدولًا بما فيه سجل الترحيلات، repeat=0 |
| git diff --check | A ثم B والتسليم | 0 |

نُفذت كذلك خطوة CI السلبية للحزمة: max_allowed_packet=16MiB في **المثيل المعزول وحده** جعل db:check-cms يرفض بـexit 1 المتوقع؛ بعد إعادته إلى 256MiB نجح بـ0. لا فشل متجاوز ولا تخفيف حدود.

أوامر التهيئة والصيانة نفسها نجحت من web وحده: db:migrate، site:init (7 صفحات منشورة و12 قائمة)، admin:create عبر stdin دون تسجيل كلمة المرور، data:backup بنمطي backup/restore، db:check وdata:recovery-check، npm start ودخول المدير و14 URL عربية/إنجليزية، وstart:worker --once. بقي bcrypt ومعرّف المدير ومحتوى الصفحات بعد الاستعادة. رُفضت إعادة site:init وadmin:create على بيانات قائمة بـexit 1 المتوقع دون تغييرها. لا حاجة لأي أداة مصدر قديم.

المحاولة الأولى لتشغيل العامل في تجربة التهيئة افتقدت SMTP_HOST/SMTP_FROM: سُجل startup_failed، وبقي اتصال DB مفتوحًا فجرى إيقاف **الطفل الاصطناعي المملوك فقط**؛ لم يُمس عامل المطور القائم. أُعيدت التجربة على قواعد جديدة بإعداد نقل loopback وطابور فارغ ونجحت. هذا حد سابق عند إعداد SMTP ناقص، وليس إرسالًا ناجحًا؛ الإرسال الفعلي وحالات الانقطاع مثبتة بفحص test:worker. حُدث README ودليل التشغيل لذكر SMTP صراحةً دون تغيير سياسة TLS أو كود العامل.

npm ci أصدر تنبيه 12 high advisories؛ لم تُجر تحديثات أمنية أو major خارج نطاق التنظيف، ولم يُعرض فحص audit بوصفه ناجحًا. كل artifacts وdumps والمفاتيح والسجلات الكبيرة اصطناعية ومحلية ignored؛ أضيف JSON موجز فقط، ولا صور جديدة أو أرشيف مصدر بديل.

## التراجع والحدود

التراجع عبر `git revert` لالتزامات PR ثم npm ci والبناء من القفل. لا migration جديدة أو تغيير مخطط أو بيانات تشغيل؛ لا restore قديم فوق كتابات أحدث. المرجع المحذوف يبقى في تاريخ Git، ولا حاجة لإعادته لإصلاح المنتج الحالي. فحوص الاستعادة محلية اصطناعية؛ لا تثبت فقد مضيف أو وصول البريد للمستلم أو نقل بيانات إنتاج أو نشرًا. الدمج والنشر بقرار مراجعة مستقل.

قياس الالتزام A: **2329 → 1771 ملفًا** (−558)، و**98,098,495 → 84,942,181 بايتًا** (−13,156,314؛ نحو 13.4%). أضاف التسليم اللاحق ملف أدلة موجزًا وتحديثات توثيق وتجربة، ولا يحوّل هذا القياس إلى حجم التاريخ أو gzip حزمة الموقع. الحذف لا يمحو Git history ولا يضمن تسريع التطبيق.

مراجعة أداة upgrade v2 كشفت خللًا موروثًا: كانت تؤجل SourceV2 وحدها وتطبق migrations الأحدث قبلها، ثم يفشل assertSchema. صُحح **harness فقط** لتطبيق prefix v1 ثم الخمس المتبقية بالترتيب الطبيعي، دون تعديل ترحيلة أو حارس أو بيانات قائمة. نجح التحقق على قاعدة جديدة: 23 جدولًا أصليًا محفوظة كل قيمها ومعرّفاتها، 51 جدولًا في المخطط الحالي، والتطبيق المتكرر لا يطبق أي ترحيلة. المحاولة الفاشلة محفوظة محليًا وليست نجاحًا.
