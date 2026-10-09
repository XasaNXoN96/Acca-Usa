import type { LegalDocs } from "./types";

export const privacy: LegalDocs = {
  en: {
    title: "Privacy Policy and Consent to Personal Data Processing",
    intro: "This policy explains what personal data {operator} (“we”) processes when you use ACCA USA, why, for how long and what rights you have. By ticking the consent box at registration you consent to the processing described here.",
    sections: [
      { heading: "1. Operator", body: ["{operator}, {address}, tax ID {taxId}. Contact for all privacy requests: {contact}."] },
      { heading: "2. What we process", body: [
        "Account: name, e-mail address, language, role and status, date of registration. Your password is never stored — only a salted one-way hash.",
        "Learning: enrolments, progress, test and exam attempts with your answers and results, certificates issued to you, your private notes and your review of wrong answers.",
        "Payments: payment records (amount, currency, status, reference numbers). Card details are entered on the payment provider's page and are not received or stored by us.",
        "Technical and security data: your client IP address and device information in security logs, rate-limit counters and (for administrators) an audit log of actions; session cookies (see the Cookie Notice).",
        "Communication: service e-mails (welcome, password reset, payment and certificate notices). Marketing e-mails only if you ticked the optional box; you can withdraw it at any time in your profile.",
      ] },
      { heading: "3. Why and on what basis", body: ["To create and secure your account and provide the courses you enrol in (performance of the agreement); to take payments and keep payment records (agreement and legal obligations); to protect the service and prevent abuse (legitimate interest); and — for the purposes described here and for optional marketing — your consent."] },
      { heading: "4. Who receives data", body: ["Only service providers needed to run the service, under their own confidentiality obligations: payment processing (Stripe, Inc., when card payments are enabled), e-mail delivery (the SMTP provider configured by the operator), and hosting, database and file storage at the location stated below. We do not sell personal data. Your certificate verification page shows only the holder's first name and the initial of the surname."] },
      { heading: "5. Where data is stored", body: ["Data is stored at: {location}. If this is outside your country, data is transferred across borders only as far as needed for the service and as permitted by applicable law."] },
      { heading: "6. How long", body: ["Account and learning data — while your account exists. When you ask us to delete the account we remove or anonymise personal data, except records we must keep by law (for example payment and accounting records) and security logs for the period needed to protect the service. Backups are overwritten on their normal cycle."] },
      { heading: "7. Your rights", body: ["You may ask us to confirm whether we process your data, to give you access to it, to correct it, to delete it, to restrict or stop processing, and to withdraw consent at any time (withdrawal does not affect processing before it, and withdrawing the consent required for the service means we can no longer provide it). Write to {contact}. You may also complain to the competent data-protection authority.", "You can change the optional e-mail preference yourself in Profile → Privacy."] },
      { heading: "8. Security", body: ["Passwords are hashed; sessions use signed, HTTP-only cookies; administrator accounts use two-step verification; access to private materials and results is checked on the server; administrator actions are recorded in a tamper-evident audit log. No system is perfectly secure, and we will notify you and the authorities where the law requires."] },
      { heading: "9. Changes", body: ["When this text changes materially we publish a new version and ask you to accept it at your next sign-in. The versions you accepted, with dates, are shown in your profile."] },
    ],
  },
  ru: {
    title: "Политика конфиденциальности и согласие на обработку персональных данных",
    intro: "Эта политика объясняет, какие персональные данные обрабатывает {operator} («мы») при использовании ACCA USA, зачем, как долго и какие у вас есть права. Отметив согласие при регистрации, вы соглашаетесь на описанную здесь обработку.",
    sections: [
      { heading: "1. Оператор", body: ["{operator}, {address}, ИНН/STIR {taxId}. Контакт по вопросам персональных данных: {contact}."] },
      { heading: "2. Что мы обрабатываем", body: [
        "Аккаунт: имя, адрес e-mail, язык, роль и статус, дата регистрации. Пароль не хранится — только необратимый хэш с солью.",
        "Обучение: записи на курсы, прогресс, попытки тестов и экзаменов с вашими ответами и результатами, выданные вам сертификаты, ваши личные заметки и разбор ошибок.",
        "Платежи: записи о платежах (сумма, валюта, статус, номера операций). Данные карты вводятся на странице платёжного провайдера и нами не принимаются и не хранятся.",
        "Технические данные и безопасность: IP-адрес и сведения об устройстве в журналах безопасности, счётчики ограничения запросов и (для администраторов) журнал аудита действий; сессионные cookie (см. Уведомление о cookie).",
        "Коммуникации: служебные письма (приветствие, сброс пароля, уведомления о платежах и сертификатах). Маркетинговые письма — только если вы отметили необязательный пункт; отозвать его можно в любой момент в профиле.",
      ] },
      { heading: "3. Зачем и на каком основании", body: ["Чтобы создать и защитить аккаунт и предоставить курсы, на которые вы записаны (исполнение договора); принимать платежи и вести платёжные записи (договор и требования закона); защищать сервис и предотвращать злоупотребления (законный интерес); а для описанных здесь целей и для необязательной рассылки — на основании вашего согласия."] },
      { heading: "4. Кто получает данные", body: ["Только поставщики, необходимые для работы сервиса, с обязательствами конфиденциальности: платёжная обработка (Stripe, Inc., когда включены карточные платежи), доставка e-mail (SMTP-провайдер, выбранный оператором), хостинг, база данных и файловое хранилище в месте, указанном ниже. Мы не продаём персональные данные. На странице проверки сертификата показываются только имя владельца и первая буква фамилии."] },
      { heading: "5. Где хранятся данные", body: ["Данные хранятся: {location}. Если это за пределами вашей страны, трансграничная передача выполняется только в объёме, необходимом для сервиса, и в порядке, допустимом применимым законом."] },
      { heading: "6. Как долго", body: ["Данные аккаунта и обучения — пока существует аккаунт. По вашему запросу на удаление мы удаляем или обезличиваем персональные данные, кроме записей, которые обязаны хранить по закону (например, платёжных и бухгалтерских), и журналов безопасности на срок, необходимый для защиты сервиса. Резервные копии перезаписываются в обычном цикле."] },
      { heading: "7. Ваши права", body: ["Вы можете запросить подтверждение обработки ваших данных, доступ к ним, исправление, удаление, ограничение или прекращение обработки и в любой момент отозвать согласие (отзыв не затрагивает обработку до него; отзыв согласия, необходимого для сервиса, означает, что мы больше не сможем его предоставлять). Пишите на {contact}. Вы также вправе обратиться с жалобой в уполномоченный орган по защите персональных данных.", "Необязательную подписку на e-mail вы меняете сами: Профиль → Конфиденциальность."] },
      { heading: "8. Безопасность", body: ["Пароли хэшируются; сессии используют подписанные HTTP-only cookie; аккаунты администраторов защищены двухэтапной проверкой; доступ к закрытым материалам и результатам проверяется на сервере; действия администраторов записываются в журнал аудита с защитой от подделки. Абсолютно безопасных систем не бывает; мы уведомим вас и органы власти, когда этого требует закон."] },
      { heading: "9. Изменения", body: ["При существенном изменении текста мы публикуем новую редакцию и просим принять её при следующем входе. Принятые вами версии с датами показаны в профиле."] },
    ],
  },
  uz: {
    title: "Maxfiylik siyosati va shaxsiy ma’lumotlarni qayta ishlashga rozilik",
    intro: "Ushbu siyosat {operator} (“biz”) ACCA USA’dan foydalanishda qaysi shaxsiy ma’lumotlarni, nima uchun, qancha muddat qayta ishlashini va sizning qanday huquqlaringiz borligini tushuntiradi. Ro‘yxatdan o‘tishda rozilik belgisini qo‘yish orqali siz bu yerda tavsiflangan qayta ishlashga rozilik bildirasiz.",
    sections: [
      { heading: "1. Operator", body: ["{operator}, {address}, STIR {taxId}. Shaxsiy ma’lumotlar bo‘yicha aloqa: {contact}."] },
      { heading: "2. Nimalarni qayta ishlaymiz", body: [
        "Hisob: ism, e-pochta manzili, til, rol va holat, ro‘yxatdan o‘tgan sana. Parol saqlanmaydi — faqat tuz bilan qaytarilmas xesh.",
        "O‘qish: kurslarga yozilish, o‘zlashtirish, test va imtihon urinishlari javoblar va natijalar bilan, sizga berilgan sertifikatlar, shaxsiy qaydlaringiz va xatolar tahlili.",
        "To‘lovlar: to‘lov yozuvlari (summa, valyuta, holat, operatsiya raqamlari). Karta ma’lumotlari to‘lov provayderi sahifasida kiritiladi, biz ularni qabul qilmaymiz va saqlamaymiz.",
        "Texnik va xavfsizlik ma’lumotlari: xavfsizlik jurnallarida IP-manzil va qurilma ma’lumotlari, so‘rovlarni cheklash hisoblagichlari va (administratorlar uchun) harakatlar audit jurnali; sessiya cookie’lari (Cookie xabarnomasiga qarang).",
        "Aloqa: xizmat xatlari (salomlashish, parolni tiklash, to‘lov va sertifikat xabarlari). Marketing xatlari — faqat ixtiyoriy belgini qo‘ygan bo‘lsangiz; uni profilda istalgan vaqtda bekor qilishingiz mumkin.",
      ] },
      { heading: "3. Nima uchun va qanday asosda", body: ["Hisobni yaratish va himoyalash hamda yozilgan kurslarni taqdim etish (shartnomani bajarish); to‘lovlarni qabul qilish va to‘lov yozuvlarini yuritish (shartnoma va qonun talablari); xizmatni himoyalash va suiiste’molning oldini olish (qonuniy manfaat); shuningdek bu yerda tavsiflangan maqsadlar va ixtiyoriy xabarnomalar uchun — sizning roziligingiz asosida."] },
      { heading: "4. Ma’lumotlarni kim oladi", body: ["Faqat xizmat ishlashi uchun zarur provayderlar, maxfiylik majburiyatlari bilan: to‘lovlarni qayta ishlash (karta to‘lovlari yoqilganda Stripe, Inc.), e-pochta yetkazish (operator tanlagan SMTP provayderi), quyida ko‘rsatilgan joyda hosting, ma’lumotlar bazasi va fayl saqlash. Shaxsiy ma’lumotlarni sotmaymiz. Sertifikatni tekshirish sahifasida faqat egasining ismi va familiyasining bosh harfi ko‘rsatiladi."] },
      { heading: "5. Ma’lumotlar qayerda saqlanadi", body: ["Ma’lumotlar saqlanadi: {location}. Agar bu sizning mamlakatingizdan tashqarida bo‘lsa, ma’lumotlar chegaradan faqat xizmat uchun zarur doirada va amaldagi qonun ruxsat bergan tartibda o‘tkaziladi."] },
      { heading: "6. Qancha muddat", body: ["Hisob va o‘qish ma’lumotlari — hisob mavjud ekan. Hisobni o‘chirishni so‘raganingizda biz shaxsiy ma’lumotlarni o‘chiramiz yoki shaxssizlantiramiz, qonun bo‘yicha saqlashga majbur yozuvlar (masalan, to‘lov va buxgalteriya) va xizmatni himoyalash uchun zarur muddatdagi xavfsizlik jurnallari bundan mustasno. Zaxira nusxalar odatdagi tsiklda qayta yoziladi."] },
      { heading: "7. Sizning huquqlaringiz", body: ["Ma’lumotlaringiz qayta ishlanayotganini tasdiqlashni, ularga kirishni, tuzatishni, o‘chirishni, qayta ishlashni cheklash yoki to‘xtatishni so‘rashingiz va istalgan vaqtda rozilikni qaytarib olishingiz mumkin (qaytarib olish undan oldingi qayta ishlashga ta’sir qilmaydi; xizmat uchun zarur rozilikni qaytarib olsangiz, xizmatni taqdim eta olmaymiz). {contact} manziliga yozing. Vakolatli shaxsiy ma’lumotlarni himoya qilish organiga shikoyat qilish huquqiga ham egasiz.", "Ixtiyoriy e-pochta tanlovini o‘zingiz o‘zgartirasiz: Profil → Maxfiylik."] },
      { heading: "8. Xavfsizlik", body: ["Parollar xeshlanadi; sessiyalar imzolangan HTTP-only cookie’lardan foydalanadi; administrator hisoblari ikki bosqichli tekshiruv bilan himoyalangan; yopiq materiallar va natijalarga kirish serverda tekshiriladi; administrator harakatlari soxtalashtirishdan himoyalangan audit jurnaliga yoziladi. Mutlaqo xavfsiz tizim yo‘q; qonun talab qilganda sizni va organlarni xabardor qilamiz."] },
      { heading: "9. O‘zgarishlar", body: ["Matn sezilarli o‘zgarganda yangi tahrirni e’lon qilamiz va keyingi kirishda uni qabul qilishni so‘raymiz. Siz qabul qilgan versiyalar sanalari bilan profilda ko‘rsatiladi."] },
    ],
  },
};
