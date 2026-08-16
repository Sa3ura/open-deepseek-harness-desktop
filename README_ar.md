# Open DeepSeek Harness Desktop

[English](README.md) | [简体中文](README.zh.md) | [繁體中文](README_tw.md) | [日本語](README_ja.md) | [한국어](README_ko.md) | [Deutsch](README_de.md) | [Español](README_es.md) | [Français](README_fr.md) | [Italiano](README_it.md) | [Português](README_pt.md) | [Русский](README_ru.md) | العربية | [Bahasa Indonesia](README_id.md) | [ไทย](README_th.md) | [Tiếng Việt](README_vi.md)

Open DeepSeek Harness Desktop هو إصدار مكتبي من [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) تديره جهة مجتمعية مستقلة. يجمع بيئة الوكلاء القائمة على الإضافات مع مساحة عمل مرئية لإدارة واجهات API المتوافقة والنماذج المخصصة ومساحات العمل والجلسات والإضافات وSkills.

هذا المشروع ليس منتجاً رسمياً من DeepSeek. يُنشر بموجب [ترخيص MIT](LICENSE) وهو حالياً في مرحلة المعاينة للمطورين.

## الإمكانات الأساسية

- إعداد DeepSeek أو واجهة API متوافقة وعنوانها الأساسي ومرجع المفتاح ومعرّفات النماذج عند التشغيل الأول أو من الإعدادات.
- إدارة الجلسات الدائمة ونسخ الرسائل أو حذفها ومسح المحادثات ومراجعة ملخص خطوات التنفيذ المهمة.
- تثبيت إضافات السجل المدعومة عبر مسار مضبوط بنقرة واحدة واستخدام Skills والسمات وخلفيات المحادثة المحلية.
- تم التحقق أولاً من تشغيل نسخة سطح المكتب من المصدر على macOS. ما زالت حزم Windows وLinux بحاجة إلى تجهيز واختبار أصلي.

## التشغيل من المصدر

ثبّت Node.js `^22.19.0 || >=24.0.0` وpnpm `11.7.0` ثم نفّذ:

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

راجع [README الإنجليزية](README.md) أو [README الصينية المبسطة](README.zh.md) للتفاصيل الكاملة حول الميزات والبنية والأمان وحالة المنصات. تتوفر أيضاً [وثائق تطبيق سطح المكتب](apps/desktop/README.md) و[دليل المستخدم](docs/user/guide/index.md).

## حول FLAQ.AI

توفّر [FLAQ.AI](https://flaq.ai/) نماذج للصور والفيديو والصوت واللغة عبر واجهات API والوثائق ومسارات عمل للمطورين. ليست مطلوبة لتشغيل هذا المشروع. تحقّق من الدعم والأسعار وشروط معالجة البيانات الحالية في [وثائق FLAQ.AI](https://flaq.ai/docs/) قبل الاستخدام.

## الترخيص

هذا المشروع متاح بموجب [ترخيص MIT](LICENSE).
